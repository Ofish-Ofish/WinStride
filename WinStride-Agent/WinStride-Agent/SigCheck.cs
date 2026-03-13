using System;
using System.Collections.Concurrent;
using System.IO;
using System.Management.Automation;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;

namespace WinStrideAgent.Utils
{
    public static class SigCheck
    {
        private static readonly ConcurrentDictionary<string, (string Status, DateTime LastWrite)> _signatureCache
            = new ConcurrentDictionary<string, (string, DateTime)>();

        private const int TRUST_E_NOSIGNATURE = unchecked((int)0x800B0100);

        #region Native Windows API (WinTrust)
        private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);
        private const uint WTD_UI_NONE = 2;
        private const uint WTD_REVOKE_NONE = 0;
        private const uint WTD_CHOICE_FILE = 1;
        private const uint WTD_STATEACTION_IGNORE = 0;
        private static readonly Guid WINTRUST_ACTION_GENERIC_VERIFY_V2 = new Guid("{00AAC56B-CD44-11d0-8CC2-00C04FC295EE}");

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct WINTRUST_FILE_INFO
        {
            public uint cbStruct;
            [MarshalAs(UnmanagedType.LPWStr)] public string pcwszFilePath;
            public IntPtr hFile;
            public IntPtr pgKnownSubject;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct WINTRUST_DATA
        {
            public uint cbStruct;
            public IntPtr pPolicyCallbackData;
            public IntPtr pSIPClientData;
            public uint dwUIChoice;
            public uint fdwRevocationChecks;
            public uint dwUnionChoice;
            public IntPtr pFile;
            public uint dwStateAction;
            public IntPtr hWVTStateData;
            public IntPtr pwszURLReference;
            public uint dwProvFlags;
            public uint dwWaitFortpPolicy;
        }

        [DllImport("wintrust.dll", ExactSpelling = true, SetLastError = true, CharSet = CharSet.Unicode)]
        static extern int WinVerifyTrust(IntPtr hwnd, [MarshalAs(UnmanagedType.LPStruct)] Guid pgActionID, IntPtr pWVTData);
        #endregion

        public static string GetSignatureStatus(string filePath)
        {
            string normalizedPath = CleanImagePath(filePath);
            if (string.IsNullOrWhiteSpace(normalizedPath) || !File.Exists(normalizedPath))
                return "File Not Found";

            try
            {
                string lowerPath = normalizedPath.ToLowerInvariant();
                DateTime currentWriteTime = File.GetLastWriteTimeUtc(normalizedPath);

                if (_signatureCache.TryGetValue(lowerPath, out var cached) && cached.LastWrite == currentWriteTime)
                    return cached.Status;

                string status = VerifySignature(normalizedPath);

                _signatureCache[lowerPath] = (status, currentWriteTime);
                return status;
            }
            catch
            {
                return "Access Denied";
            }
        }

        private static string VerifySignature(string filePath)
        {
            var (isTrusted, signer, errorCode) = VerifyWithWinTrust(filePath);
            if (isTrusted)
            {
                return $"Verified ({signer})";
            }

            // Catalog-signed Windows binaries often fail the raw WinVerifyTrust
            // path above with TRUST_E_NOSIGNATURE. Fall back to Authenticode.
            if (errorCode == TRUST_E_NOSIGNATURE && TryVerifyWithPowerShell(filePath, out string fallbackStatus))
            {
                return fallbackStatus;
            }

            return signer == "Unknown" ? "Unverified (No Signature)" : $"Unverified (Invalid/Expired: {signer})";
        }

        private static (bool IsTrusted, string Signer, int ErrorCode) VerifyWithWinTrust(string filePath)
        {
            int result = InvokeWinVerifyTrust(filePath);
            string signer = GetEmbeddedSigner(filePath);

            if (result == 0)
            {
                if (signer == "Unknown")
                {
                    signer = "Microsoft Windows";
                }

                return (true, signer, result);
            }

            return (false, signer, result);
        }

        private static int InvokeWinVerifyTrust(string filePath)
        {
            var fileInfo = new WINTRUST_FILE_INFO
            {
                cbStruct = (uint)Marshal.SizeOf(typeof(WINTRUST_FILE_INFO)),
                pcwszFilePath = filePath,
                hFile = IntPtr.Zero,
                pgKnownSubject = IntPtr.Zero
            };

            IntPtr pFileInfo = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(WINTRUST_FILE_INFO)));
            Marshal.StructureToPtr(fileInfo, pFileInfo, false);

            var trustData = new WINTRUST_DATA
            {
                cbStruct = (uint)Marshal.SizeOf(typeof(WINTRUST_DATA)),
                pPolicyCallbackData = IntPtr.Zero,
                pSIPClientData = IntPtr.Zero,
                dwUIChoice = WTD_UI_NONE,
                fdwRevocationChecks = WTD_REVOKE_NONE,
                dwUnionChoice = WTD_CHOICE_FILE,
                pFile = pFileInfo,
                dwStateAction = WTD_STATEACTION_IGNORE,
                hWVTStateData = IntPtr.Zero,
                pwszURLReference = IntPtr.Zero,
                dwProvFlags = 0x00000040,
                dwWaitFortpPolicy = 0
            };

            IntPtr pTrustData = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(WINTRUST_DATA)));
            Marshal.StructureToPtr(trustData, pTrustData, false);

            int result = WinVerifyTrust(INVALID_HANDLE_VALUE, WINTRUST_ACTION_GENERIC_VERIFY_V2, pTrustData);

            Marshal.FreeHGlobal(pFileInfo);
            Marshal.FreeHGlobal(pTrustData);

            return result;
        }

        private static string GetEmbeddedSigner(string filePath)
        {
            try
            {
                using (var cert = X509Certificate.CreateFromSignedFile(filePath))
                {
                    using (var cert2 = new X509Certificate2(cert))
                    {
                        return GetCommonName(cert2.Subject);
                    }
                }
            }
            catch
            {
                return "Unknown";
            }
        }

        private static bool TryVerifyWithPowerShell(string filePath, out string status)
        {
            status = string.Empty;

            try
            {
                using (PowerShell ps = PowerShell.Create())
                {
                    ps.AddCommand("Get-AuthenticodeSignature").AddParameter("FilePath", filePath);
                    var results = ps.Invoke();
                    if (ps.HadErrors || results.Count == 0 || results[0].BaseObject is not Signature signature)
                        return false;

                    status = MapPowerShellSignature(signature);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        private static string MapPowerShellSignature(Signature signature)
        {
            string signer = GetCommonName(signature.SignerCertificate?.Subject);
            if (signer == "Unknown" && signature.IsOSBinary)
            {
                signer = "Microsoft Windows";
            }

            switch (signature.Status)
            {
                case SignatureStatus.Valid:
                    return $"Verified ({signer})";
                case SignatureStatus.NotSigned:
                    return "Unverified (No Signature)";
                case SignatureStatus.HashMismatch:
                    return signer == "Unknown" ? "Unverified (Hash Mismatch)" : $"Unverified (Hash Mismatch: {signer})";
                case SignatureStatus.NotTrusted:
                    return signer == "Unknown" ? "Unverified (Not Trusted)" : $"Unverified (Not Trusted: {signer})";
                case SignatureStatus.NotSupportedFileFormat:
                    return "Unverified (Unsupported Format)";
                case SignatureStatus.Incompatible:
                    return signer == "Unknown" ? "Unverified (Incompatible Signature)" : $"Unverified (Incompatible Signature: {signer})";
                default:
                    return signer == "Unknown" ? "Unverified (Unknown Error)" : $"Unverified (Unknown Error: {signer})";
            }
        }

        private static string GetCommonName(string? subject)
        {
            if (string.IsNullOrEmpty(subject)) return "Unknown";
            string prefix = "CN=";
            int startIndex = subject.IndexOf(prefix, StringComparison.OrdinalIgnoreCase);
            if (startIndex == -1) return "Unknown";
            startIndex += prefix.Length;
            int endIndex = subject.IndexOf(',', startIndex);
            string result = (endIndex == -1) ? subject.Substring(startIndex) : subject.Substring(startIndex, endIndex - startIndex);
            return result.Trim(' ', '"');
        }

        public static string CleanImagePath(string rawPath)
        {
            if (string.IsNullOrWhiteSpace(rawPath)) return string.Empty;

            string expanded = Environment.ExpandEnvironmentVariables(rawPath);

            if (expanded.StartsWith("\\SystemRoot\\", StringComparison.OrdinalIgnoreCase))
                expanded = expanded.Replace("\\SystemRoot\\", Environment.GetEnvironmentVariable("SystemRoot") + "\\", StringComparison.OrdinalIgnoreCase);

            if (expanded.StartsWith("\""))
            {
                int nextQuote = expanded.IndexOf("\"", 1);
                if (nextQuote > 1) expanded = expanded.Substring(1, nextQuote - 1);
            }

            string[] validExtensions = { ".exe", ".sys", ".dll", ".ocx", ".scr" };
            foreach (var ext in validExtensions)
            {
                int index = expanded.IndexOf(ext, StringComparison.OrdinalIgnoreCase);
                if (index != -1)
                {
                    expanded = expanded.Substring(0, index + ext.Length).Trim();
                    break;
                }
            }

            return expanded.Trim();
        }

        public static void FlushCache() => _signatureCache.Clear();
    }
}
