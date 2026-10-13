"""
Safe evaluation of admin-authored formula expressions.

Mirrors the frontend's expr-eval usage: plain arithmetic, named variables, and a
small whitelisted function set. No attribute access, no imports, no comprehensions,
no assignment — simpleeval enforces all of that by construction (it only ever
evaluates a restricted AST subset), so this is safe to run against untrusted
formula text from the Formulas page.

Formulas are written with pow(x, y) rather than ^ or ** so the same expression
string is valid, unmodified, on both the Python (simpleeval) and JS (expr-eval)
sides — see the "Safety" section of the backend build plan.
"""

import math
import re

from simpleeval import EvalWithCompoundTypes, InvalidExpression, NameNotDefined, safe_power

def _iff(condition: float, if_true: float, if_false: float) -> float:
    """`iff(cond, a, b)` stands in for a ternary — one syntax valid on both the
    Python (simpleeval) and JS (expr-eval) evaluators, since native ternary
    syntax differs between the two languages."""
    return if_true if condition else if_false


ALLOWED_FUNCTIONS = {
    "min": min,
    "max": max,
    "round": round,
    "abs": abs,
    "sqrt": math.sqrt,
    # simpleeval's own `**` operator is bounded by safe_power/MAX_POWER, but calling
    # Python's builtin pow() as a plain function bypasses that guard entirely —
    # pow(99999999, 99999999) would peg the server computing a tens-of-millions-digit
    # number. Reuse simpleeval's own bounded version instead of Python's builtin.
    "pow": safe_power,
    "iff": _iff,
}

ALLOWED_NAMES = {
    "PI": math.pi,
}


class FormulaError(Exception):
    pass


# A variable name: not preceded by a word char or '.', so the "e3" in "1e3" or the
# "5" in "1.5" never match. '.' is allowed inside a name for legacy keys like "sectionA.a1".
_IDENTIFIER_RE = re.compile(r"(?<![\w.])[A-Za-z_][\w.]*")


def copy_source(expression: str) -> str | None:
    """If `expression` is nothing but a single variable name (e.g. "bearing1Designation"),
    return that name: such a "copy" formula takes the source field's value as-is —
    text, number or selected option — instead of evaluating arithmetic. Otherwise None."""
    expr = (expression or "").strip()
    if _IDENTIFIER_RE.fullmatch(expr) and expr not in ALLOWED_FUNCTIONS and expr not in ALLOWED_NAMES:
        return expr
    return None


def extract_variables(expression: str) -> list[str]:
    """Variable names `expression` references, in first-seen order — every identifier
    except whitelisted function names and constants."""
    names: list[str] = []
    for name in _IDENTIFIER_RE.findall(expression or ""):
        name = name.rstrip(".")
        if name and name not in ALLOWED_FUNCTIONS and name not in ALLOWED_NAMES and name not in names:
            names.append(name)
    return names


MAX_MISSING_NAME_RETRIES = 25


def evaluate_formula(expression: str, variables: dict[str, float]) -> float:
    """
    Evaluate `expression` against `variables`. A variable the expression
    references but that's absent from `variables` (or explicitly None)
    defaults to 0, matching the frontend's `num()` helper convention (an
    unfilled Technical Data Sheet field reads as 0, not an error) — keeps
    preview and live calculation forgiving of partially-filled data.
    """
    names = {**ALLOWED_NAMES, **{k: (v if v is not None else 0) for k, v in variables.items()}}

    for _ in range(MAX_MISSING_NAME_RETRIES):
        evaluator = EvalWithCompoundTypes(functions=ALLOWED_FUNCTIONS, names=names)
        try:
            result = evaluator.eval(expression)
            break
        except NameNotDefined as exc:
            missing = getattr(exc, "name", None)
            if not missing or missing in names:
                raise FormulaError(f"Unknown variable: {exc}") from exc
            names[missing] = 0
        except InvalidExpression as exc:
            raise FormulaError(f"Invalid expression: {exc}") from exc
        except ZeroDivisionError as exc:
            raise FormulaError("Division by zero") from exc
        except Exception as exc:  # noqa: BLE001 - surface any other parse/eval failure as a FormulaError
            raise FormulaError(str(exc)) from exc
    else:
        raise FormulaError("Too many undefined variables in expression")

    if not isinstance(result, (int, float)):
        raise FormulaError("Formula must evaluate to a number")
    return float(result)
