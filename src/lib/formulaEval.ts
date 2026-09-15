/**
 * Safe evaluator for admin-authored formula expressions — the frontend counterpart
 * to the backend's `formulas/evaluator.py` (simpleeval). Deliberately NOT built on
 * a general-purpose expression library: `expr-eval` (the obvious npm choice) has an
 * unpatched, no-fix-available prototype-pollution / unrestricted-function-call
 * vulnerability (GHSA-8gw3-rxh4-v6jx, GHSA-jc85-fpwf-qm7x) — unacceptable for a
 * feature whose whole point is safely running untrusted formula text. `mathjs`'s
 * `evaluate()` carries the same category of risk. A tiny purpose-built recursive-
 * descent parser over the intentionally small grammar below has no such surface:
 * no property/attribute access, no assignment, no arbitrary function values.
 *
 * Grammar: numbers, + - * / and unary -, parentheses, comparisons (> < >= <= == !=),
 * named variables, and calls to a fixed function whitelist (min, max, round, abs,
 * sqrt, pow, iff) plus the constant PI. Formulas use `pow(x, y)` and `iff(cond, a, b)`
 * rather than `**`/`^`/native ternary so one expression string is valid, unmodified,
 * on both this evaluator and the Python one.
 */

export class FormulaError extends Error {}

type TokenType = "number" | "identifier" | "op" | "lparen" | "rparen" | "comma" | "eof"
interface Token {
  type: TokenType
  value: string
}

const OPERATORS = new Set(["+", "-", "*", "/", ">", "<", "="])

function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expression.length) {
    const ch = expression[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < expression.length && /[0-9.]/.test(expression[j])) j++
      tokens.push({ type: "number", value: expression.slice(i, j) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < expression.length && /[A-Za-z0-9_]/.test(expression[j])) j++
      tokens.push({ type: "identifier", value: expression.slice(i, j) })
      i = j
      continue
    }
    if (ch === "(") {
      tokens.push({ type: "lparen", value: ch })
      i++
      continue
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", value: ch })
      i++
      continue
    }
    if (ch === ",") {
      tokens.push({ type: "comma", value: ch })
      i++
      continue
    }
    if (ch === "!" && expression[i + 1] === "=") {
      tokens.push({ type: "op", value: "!=" })
      i += 2
      continue
    }
    if ((ch === ">" || ch === "<" || ch === "=") && expression[i + 1] === "=") {
      tokens.push({ type: "op", value: ch + "=" })
      i += 2
      continue
    }
    if (OPERATORS.has(ch)) {
      tokens.push({ type: "op", value: ch })
      i++
      continue
    }
    throw new FormulaError(`Unexpected character '${ch}' in expression`)
  }
  tokens.push({ type: "eof", value: "" })
  return tokens
}

const CONSTANTS: Record<string, number> = { PI: Math.PI }

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  round: (a) => Math.round(a),
  abs: (a) => Math.abs(a),
  sqrt: (a) => Math.sqrt(a),
  pow: (a, b) => Math.pow(a, b),
  iff: (cond, ifTrue, ifFalse) => (cond ? ifTrue : ifFalse),
}

class Parser {
  private pos = 0
  private tokens: Token[]
  private variables: Record<string, number>

  constructor(tokens: Token[], variables: Record<string, number>) {
    this.tokens = tokens
    this.variables = variables
  }

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private consume(type?: TokenType): Token {
    const t = this.tokens[this.pos]
    if (type && t.type !== type) throw new FormulaError(`Expected ${type} but got '${t.value || "end of expression"}'`)
    this.pos++
    return t
  }

  parse(): number {
    const result = this.parseComparison()
    if (this.peek().type !== "eof") throw new FormulaError(`Unexpected token '${this.peek().value}'`)
    return result
  }

  private parseComparison(): number {
    const left = this.parseAddition()
    const t = this.peek()
    if (t.type === "op" && [">", "<", ">=", "<=", "==", "!="].includes(t.value)) {
      this.consume()
      const right = this.parseAddition()
      switch (t.value) {
        case ">":
          return left > right ? 1 : 0
        case "<":
          return left < right ? 1 : 0
        case ">=":
          return left >= right ? 1 : 0
        case "<=":
          return left <= right ? 1 : 0
        case "==":
          return left === right ? 1 : 0
        case "!=":
          return left !== right ? 1 : 0
      }
    }
    return left
  }

  private parseAddition(): number {
    let left = this.parseTerm()
    while (this.peek().type === "op" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.consume().value
      const right = this.parseTerm()
      left = op === "+" ? left + right : left - right
    }
    return left
  }

  private parseTerm(): number {
    let left = this.parseUnary()
    while (this.peek().type === "op" && (this.peek().value === "*" || this.peek().value === "/")) {
      const op = this.consume().value
      const right = this.parseUnary()
      if (op === "/" && right === 0) throw new FormulaError("Division by zero")
      left = op === "*" ? left * right : left / right
    }
    return left
  }

  private parseUnary(): number {
    if (this.peek().type === "op" && this.peek().value === "-") {
      this.consume()
      return -this.parseUnary()
    }
    return this.parsePrimary()
  }

  private parsePrimary(): number {
    const t = this.peek()
    if (t.type === "number") {
      this.consume()
      return parseFloat(t.value)
    }
    if (t.type === "lparen") {
      this.consume()
      const value = this.parseComparison()
      this.consume("rparen")
      return value
    }
    if (t.type === "identifier") {
      this.consume()
      if (this.peek().type === "lparen") {
        this.consume()
        const args: number[] = []
        if (this.peek().type !== "rparen") {
          args.push(this.parseComparison())
          while (this.peek().type === "comma") {
            this.consume()
            args.push(this.parseComparison())
          }
        }
        this.consume("rparen")
        const fn = FUNCTIONS[t.value]
        if (!fn) throw new FormulaError(`Unknown function '${t.value}'`)
        return fn(...args)
      }
      if (t.value in CONSTANTS) return CONSTANTS[t.value]
      const v = this.variables[t.value]
      return v === undefined || v === null || Number.isNaN(v) ? 0 : v
    }
    throw new FormulaError(`Unexpected token '${t.value || "end of expression"}'`)
  }
}

/** Evaluate `expression` against `variables`. A referenced variable absent from
 * `variables` defaults to 0, matching the frontend's existing `num()` convention
 * (an unfilled Technical Data Sheet field reads as 0) and the backend evaluator's
 * same forgiving behavior. */
export function evaluateFormula(expression: string, variables: Record<string, number | undefined>): number {
  const cleanVars: Record<string, number> = {}
  for (const [k, v] of Object.entries(variables)) cleanVars[k] = typeof v === "number" && !Number.isNaN(v) ? v : 0
  const tokens = tokenize(expression)
  const result = new Parser(tokens, cleanVars).parse()
  if (typeof result !== "number" || Number.isNaN(result)) throw new FormulaError("Formula must evaluate to a number")
  return result
}
