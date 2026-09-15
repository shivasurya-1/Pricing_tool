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

from simpleeval import EvalWithCompoundTypes, InvalidExpression, NameNotDefined

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
    "pow": pow,
    "iff": _iff,
}

ALLOWED_NAMES = {
    "PI": math.pi,
}


class FormulaError(Exception):
    pass


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
