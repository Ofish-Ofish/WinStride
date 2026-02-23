/* ------------------------------------------------------------------ */
/*  Sigma condition expression parser and evaluator                    */
/*                                                                     */
/*  Supports: and, or, not, parentheses, named refs,                  */
/*  quantifiers (1 of X*, all of X*, 1 of them, all of them)          */
/* ------------------------------------------------------------------ */

export type ConditionNode =
  | { type: 'ref'; name: string }
  | { type: 'not'; child: ConditionNode }
  | { type: 'and'; left: ConditionNode; right: ConditionNode }
  | { type: 'or'; left: ConditionNode; right: ConditionNode }
  | { type: 'quantifier'; mode: '1_of' | 'all_of'; pattern: string };

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }
    if (expr[i] === '(' || expr[i] === ')') {
      tokens.push(expr[i++]);
      continue;
    }
    // Read a word (including wildcards like selection_*)
    let word = '';
    while (i < expr.length && /[^\s()]/.test(expr[i])) {
      word += expr[i++];
    }
    tokens.push(word);
  }
  return tokens;
}

export function parseCondition(expr: string): ConditionNode {
  const tokens = tokenize(expr);
  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }
  function consume(): string {
    return tokens[pos++];
  }
  function expect(t: string) {
    const got = consume();
    if (got !== t) {
      throw new Error(`Expected '${t}' but got '${got}' at position ${pos - 1} in: ${expr}`);
    }
  }

  function parseOr(): ConditionNode {
    let left = parseAnd();
    while (peek() === 'or') {
      consume();
      left = { type: 'or', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): ConditionNode {
    let left = parseNot();
    while (peek() === 'and') {
      consume();
      left = { type: 'and', left, right: parseNot() };
    }
    return left;
  }

  function parseNot(): ConditionNode {
    if (peek() === 'not') {
      consume();
      return { type: 'not', child: parseNot() };
    }
    return parsePrimary();
  }

  function parsePrimary(): ConditionNode {
    const t = peek();

    // Parenthesized expression
    if (t === '(') {
      consume();
      const node = parseOr();
      expect(')');
      return node;
    }

    // Quantifier: "1 of ..." or "all of ..."
    if (t === '1' || t === 'all') {
      const mode = consume();
      expect('of');
      const pattern = consume();
      return {
        type: 'quantifier',
        mode: mode === 'all' ? 'all_of' : '1_of',
        pattern,
      };
    }

    // Named reference
    return { type: 'ref', name: consume() };
  }

  const result = parseOr();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token '${tokens[pos]}' at position ${pos} in: ${expr}`);
  }
  return result;
}

/** Match a glob-like pattern (only trailing *) against block names */
function matchPattern(pattern: string, names: string[]): string[] {
  if (pattern === 'them') return names;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return names.filter((n) => n.startsWith(prefix));
  }
  return names.filter((n) => n === pattern);
}

/**
 * Evaluate a parsed condition with lazy block resolution.
 * Blocks are evaluated on-demand so short-circuit (and/or) avoids wasted work.
 *
 * @param getBlock  Lazily evaluates a named detection block (cached by caller).
 * @param blockNames  All available block names (needed for quantifier patterns).
 */
export function evaluateCondition(
  node: ConditionNode,
  getBlock: (name: string) => boolean,
  blockNames: string[],
): boolean {
  switch (node.type) {
    case 'ref':
      return getBlock(node.name);
    case 'not':
      return !evaluateCondition(node.child, getBlock, blockNames);
    case 'and':
      return (
        evaluateCondition(node.left, getBlock, blockNames) &&
        evaluateCondition(node.right, getBlock, blockNames)
      );
    case 'or':
      return (
        evaluateCondition(node.left, getBlock, blockNames) ||
        evaluateCondition(node.right, getBlock, blockNames)
      );
    case 'quantifier': {
      const names = matchPattern(node.pattern, blockNames);
      if (node.mode === 'all_of') {
        return names.length > 0 && names.every((n) => getBlock(n));
      }
      return names.some((n) => getBlock(n));
    }
  }
}
