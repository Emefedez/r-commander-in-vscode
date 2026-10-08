// Helpers for generating R source text.
const reserved = new Set(['if', 'else', 'repeat', 'while', 'function', 'for', 'next', 'break',
  'TRUE', 'FALSE', 'NULL', 'Inf', 'NaN', 'NA', 'in']);

const isSyntactic = name => /^([A-Za-z]|\.(?![0-9]))[A-Za-z0-9._]*$/.test(name) && !reserved.has(name);
const S = name => isSyntactic(name) ? name : '`' + name.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`';
const rs = value => JSON.stringify(String(value));
const rc = values => values.length === 1 ? rs(values[0]) : `c(${values.map(rs).join(', ')})`;
const rbool = value => value ? 'TRUE' : 'FALSE';

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const EXPRESSION = /^[-+*/^().\d\seEpiInf]+$/; // arithmetic only, e.g. 1/6 or 2*pi
const isNumber = text => NUMBER.test(text.trim());
const isNumericExpression = text => text.trim() !== '' && (isNumber(text) || EXPRESSION.test(text.trim()));
const splitList = text => text.split(/[,;\s]+/).map(item => item.trim()).filter(Boolean);
const rnums = items => items.length === 1 ? items[0] : `c(${items.join(', ')})`;

// Values typed by the user become numeric when every item is a number.
function typedVector(text) {
  const items = text.split(/[,;\n]+/).map(item => item.trim()).filter(item => item !== '');
  const numeric = items.every(item => isNumber(item) || item === 'NA');
  return {
    count: items.length,
    code: `c(${items.map(item => numeric || item === 'NA' ? item : rs(item)).join(', ')})`
  };
}

// Builds helpers bound to the dataset the command works on.
function context(ds, state = {}) {
  const objects = new Set(state.objects || []);
  const fresh = prefix => {
    let n = 1;
    while (objects.has(`${prefix}.${n}`)) n++;
    return `${prefix}.${n}`;
  };
  return {
    ds,
    dv: name => `${ds}$${S(name)}`,
    cols: names => `${ds}[, ${rc(names)}, drop = FALSE]`,
    rhs: (names, sep = ' + ') => names.map(S).join(sep),
    fresh,
    objects,
    S, rs, rc, rbool, rnums
  };
}

module.exports = { S, rs, rc, rbool, rnums, isNumber, isNumericExpression, splitList, typedVector, context, isSyntactic };
