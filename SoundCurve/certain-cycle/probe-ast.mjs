import { parse } from 'mathjs';
const inputs = [
  'constructor(1)', '__proto__', 'toString(1)', 'hasOwnProperty("x")', 'valueOf',
  'this', 'x.constructor', '[1,2][0]', 'a=1', 'f(x)=x', 'eval(1)', 'Function(1)',
  'import(1)', 'x', 'sin(x)', 'sum(k=0,3,k)', 'x>1 ? x : 0', 'not(x)', 'x!',
  '2^3^2', '-x^2', '2^-x', 'log(8, 2)', 'nthRoot(8, 3)', 'cbrt(8)', 'x and 1',
];
for (const s of inputs) {
  try {
    const n = parse(s);
    console.log(JSON.stringify(s), '=>', n.type, JSON.stringify(n.toString()).slice(0, 80));
    if (n.type === 'OperatorNode') console.log('   op=', n.op, 'fn=', n.fn, 'args=', n.args.length);
    if (n.type === 'FunctionNode') console.log('   fname=', n.name, 'args=', n.args.length);
    if (n.type === 'SymbolNode') console.log('   sname=', n.name);
    if (n.type === 'AssignmentNode') console.log('   object=', n.object?.type, 'value=', n.value?.toString());
    if (n.type === 'AccessorNode') console.log('   object=', n.object?.toString(), 'index=', n.index?.toString());
  } catch (e) { console.log(JSON.stringify(s), '=> PARSE-ERROR', String(e).slice(0, 100)); }
}
