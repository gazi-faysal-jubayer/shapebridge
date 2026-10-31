// Safe expression engine for parametric models: parse once, evaluate, and print
// in each target CAD tool's own syntax so parameters stay editable there.

export type Ast =
  | { t: "num"; v: number }
  | { t: "ref"; name: string }
  | { t: "neg"; a: Ast }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Ast; b: Ast }
  | { t: "call"; fn: Fn; a: Ast };

// shortcut: only functions every target (FreeCAD, OpenSCAD, Python, Fusion 360) spells the same way; add trig once degree/radian mapping exists.
const FNS = ["sqrt", "abs"] as const;
type Fn = (typeof FNS)[number];

export type Dialect = "plain" | "freecad" | "openscad" | "python" | "fusion";

export interface Param {
  name: string;
  expr: string;
  note?: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set<string>([
  ...FNS,
  "and", "or", "not", "if", "else", "for", "in", "is", "def", "class", "import", "from",
  "return", "lambda", "None", "True", "False", "pi", "Params",
]);

export function isValidName(name: string): boolean {
  return NAME.test(name) && !RESERVED.has(name);
}

export function parse(src: string): Ast {
  const toks = src.match(/\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+|[A-Za-z_]\w*|[-+*/^()]|\S/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  const expect = (s: string) => {
    if (next() !== s) throw new Error(`Expected "${s}" in "${src}"`);
  };

  // precedence: + - < * / < unary - < ^ (right-assoc)
  function sum(): Ast {
    let a = product();
    while (peek() === "+" || peek() === "-") a = { t: "bin", op: next() as "+" | "-", a, b: product() };
    return a;
  }
  function product(): Ast {
    let a = unary();
    while (peek() === "*" || peek() === "/") a = { t: "bin", op: next() as "*" | "/", a, b: unary() };
    return a;
  }
  function unary(): Ast {
    if (peek() === "-") {
      next();
      return { t: "neg", a: unary() };
    }
    if (peek() === "+") next();
    return power();
  }
  function power(): Ast {
    const a = atom();
    if (peek() === "^") {
      next();
      return { t: "bin", op: "^", a, b: unary() };
    }
    return a;
  }
  function atom(): Ast {
    const tok = next();
    if (tok === undefined) throw new Error(`Unexpected end of "${src}"`);
    if (tok === "(") {
      const a = sum();
      expect(")");
      return a;
    }
    if (/^[\d.]/.test(tok)) return { t: "num", v: Number(tok) };
    if (NAME.test(tok)) {
      if ((FNS as readonly string[]).includes(tok)) {
        expect("(");
        const a = sum();
        expect(")");
        return { t: "call", fn: tok as Fn, a };
      }
      if (RESERVED.has(tok)) throw new Error(`"${tok}" is reserved`);
      return { t: "ref", name: tok };
    }
    throw new Error(`Unexpected "${tok}" in "${src}"`);
  }

  const ast = sum();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i]}" in "${src}"`);
  return ast;
}

export function refs(ast: Ast, out = new Set<string>()): Set<string> {
  if (ast.t === "ref") out.add(ast.name);
  else if (ast.t === "neg" || ast.t === "call") refs(ast.a, out);
  else if (ast.t === "bin") {
    refs(ast.a, out);
    refs(ast.b, out);
  }
  return out;
}

export function evaluate(ast: Ast, env: Record<string, number>): number {
  switch (ast.t) {
    case "num":
      return ast.v;
    case "ref":
      if (!Object.hasOwn(env, ast.name)) throw new Error(`Unknown parameter "${ast.name}"`);
      return env[ast.name];
    case "neg":
      return -evaluate(ast.a, env);
    case "call":
      return Math[ast.fn](evaluate(ast.a, env));
    case "bin": {
      const a = evaluate(ast.a, env);
      const b = evaluate(ast.b, env);
      if (ast.op === "+") return a + b;
      if (ast.op === "-") return a - b;
      if (ast.op === "*") return a * b;
      if (ast.op === "/") return a / b;
      return a ** b;
    }
  }
}

/** Parameters sorted so each comes after the ones it references. Throws on bad names, unknown refs or cycles. */
export function orderParams(params: Param[]): Param[] {
  const byName = new Map<string, Param>();
  for (const p of params) {
    if (!isValidName(p.name)) throw new Error(`Invalid parameter name "${p.name}"`);
    if (byName.has(p.name)) throw new Error(`Duplicate parameter "${p.name}"`);
    byName.set(p.name, p);
  }
  const out: Param[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (p: Param, path: string[]) => {
    if (state.get(p.name) === "done") return;
    if (state.get(p.name) === "visiting") throw new Error(`Parameter cycle: ${[...path, p.name].join(" -> ")}`);
    state.set(p.name, "visiting");
    for (const r of refs(parse(p.expr))) {
      const dep = byName.get(r);
      if (!dep) throw new Error(`Parameter "${p.name}" references unknown "${r}"`);
      visit(dep, [...path, p.name]);
    }
    state.set(p.name, "done");
    out.push(p);
  };
  for (const p of params) visit(p, []);
  return out;
}

export function evalParams(params: Param[]): Record<string, number> {
  const env: Record<string, number> = {};
  for (const p of orderParams(params)) env[p.name] = evaluate(parse(p.expr), env);
  return env;
}

/** A parameter whose expression is a plain number: shown as an input/argument in targets. */
export function isLiteral(expr: string): boolean {
  const ast = parse(expr);
  return ast.t === "num" || (ast.t === "neg" && ast.a.t === "num");
}

const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 3, "^": 4 } as const;

function prec(ast: Ast): number {
  if (ast.t === "bin") return PREC[ast.op];
  if (ast.t === "neg") return PREC.neg;
  return 9;
}

export function print(ast: Ast, d: Dialect = "plain"): string {
  const wrap = (child: Ast, min: number) => {
    const s = print(child, d);
    return prec(child) < min ? `(${s})` : s;
  };
  switch (ast.t) {
    case "num":
      return String(ast.v);
    case "ref":
      return d === "freecad" ? `Params.${ast.name}` : ast.name;
    case "neg":
      return `-${wrap(ast.a, PREC.neg + 1)}`;
    case "call":
      return `${ast.fn}(${print(ast.a, d)})`;
    case "bin": {
      const p = PREC[ast.op];
      if (ast.op === "^") {
        if (d === "openscad") return `pow(${print(ast.a, d)}, ${print(ast.b, d)})`;
        return `${wrap(ast.a, p + 1)} ${d === "python" ? "**" : "^"} ${wrap(ast.b, p)}`;
      }
      // right operand of - and / needs parens at equal precedence: a - (b - c)
      const rightMin = ast.op === "-" || ast.op === "/" ? p + 1 : p;
      return `${wrap(ast.a, p)} ${ast.op} ${wrap(ast.b, rightMin)}`;
    }
  }
}

export const printExpr = (expr: string, d: Dialect) => print(parse(expr), d);
