"""Scratch probe of backend/formulas/evaluator.py. Each expression runs in its own process with a timeout."""
import subprocess, sys, time
BACKEND = sys.argv[1]
CASES = [
    ("attribute access",        "(1).__class__"),
    ("dunder name",             "__builtins__"),
    ("import",                  "__import__('os')"),
    ("eval / exec",             "eval('1')"),
    ("open file",               "open('x')"),
    ("lambda",                  "(lambda: 1)()"),
    ("string result",           "'abc'"),
    ("list comprehension",      "[x*2 for x in [1,2,3]][2]"),
    ("big list by multiply",    "len([1]*10)"),
    ("list multiply 10**7",     "([0]*10000000)[0]"),
    ("nested comprehension",    "[[0 for a in [0,0,0,0,0,0,0,0,0,0]] for b in [0,0,0,0,0,0,0,0,0,0]][0][0]"),
    ("pow() huge (blocked?)",   "pow(10, 10000000)"),
    ("** at simpleeval limit",  "9**3999999 > 0"),
    ("** both near limit",      "3999999**3999999 > 0"),
    ("chained ** near limit",   "(3999999**3999)**999 > 0"),
    ("division by zero",        "1/0"),
    ("iff short-circuit",       "iff(0, 1/0, 5)"),
]
code = ("import sys,time; sys.path.insert(0, r'%s'); from formulas.evaluator import evaluate_formula, FormulaError\n"
        "t=time.time()\n"
        "try:\n r=evaluate_formula(sys.argv[1], {}); print('RESULT', r, round(time.time()-t,2))\n"
        "except FormulaError as e: print('REJECTED', str(e)[:90], round(time.time()-t,2))\n"
        "except Exception as e: print('ERROR', type(e).__name__, str(e)[:80], round(time.time()-t,2))\n") % BACKEND
for label, expr in CASES:
    t = time.time()
    try:
        out = subprocess.run([sys.executable, "-c", code, expr], capture_output=True, text=True, timeout=20).stdout.strip()
    except subprocess.TimeoutExpired:
        out = "TIMEOUT after 20 s (worker would be blocked)"
    print(f"{label:24} | {expr[:44]:44} | {out}")
