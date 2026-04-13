/* ============================================================
   AutomataCraft — automata.js
   Thompson's Construction + Subset DFA + Visualization
   ============================================================ */

"use strict";

/* ─────────────────────── Global State ─────────────────────── */
let globalNFA   = null;
let globalDFA   = null;
let currentRegex= "";
let currentView = "nfa";
let svgScale    = 1;
let svgOffX     = 0, svgOffY = 0;
let isDragging  = false, dragStartX, dragStartY;

let buildTrace      = [];
let currentBuildStep= 0;
let buildComplete   = false;

// Simulation state
let simDFA      = null;
let simSteps    = [];
let simCursor   = -1;
let simPlaying  = false;
let simTimer    = null;

/* ─────────────────────── Tokenizer ─────────────────────── */
const T_CHAR   = 'CHAR';
const T_UNION  = 'UNION';
const T_STAR   = 'STAR';
const T_PLUS   = 'PLUS';
const T_OPT    = 'OPT';
const T_LPAREN = 'LPAREN';
const T_RPAREN = 'RPAREN';
const T_EPS    = 'EPS';
const T_EOF    = 'EOF';

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '(')       tokens.push({type: T_LPAREN});
    else if (ch === ')')  tokens.push({type: T_RPAREN});
    else if (ch === '|')  tokens.push({type: T_UNION});
    else if (ch === '*')  tokens.push({type: T_STAR});
    else if (ch === '+')  tokens.push({type: T_PLUS});
    else if (ch === '?')  tokens.push({type: T_OPT});
    else if (ch === 'ε' || ch === '\\e') tokens.push({type: T_EPS});
    else if (ch === ' ' || ch === '\t') { i++; continue; }
    else tokens.push({type: T_CHAR, value: ch});
    i++;
  }
  tokens.push({type: T_EOF});
  return tokens;
}

/* ─────────────────────── Parser (Recursive Descent) ─────────────────────── */
// Grammar:
//   Expr   → Term (| Term)*
//   Term   → Factor+
//   Factor → Atom (* | + | ?)*
//   Atom   → char | ε | ( Expr )

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos    = 0;
    this.steps  = [];
  }
  peek() { return this.tokens[this.pos]; }
  consume() { return this.tokens[this.pos++]; }

  parseExpr() {
    let left = this.parseTerm();
    while (this.peek().type === T_UNION) {
      this.consume();
      const right = this.parseTerm();
      this.steps.push({op: 'Union', left, right});
      left = {type: 'Union', left, right};
    }
    return left;
  }

  parseTerm() {
    let node = this.parseFactor();
    while ([T_CHAR, T_EPS, T_LPAREN].includes(this.peek().type)) {
      const right = this.parseFactor();
      this.steps.push({op: 'Concat', left: node, right});
      node = {type: 'Concat', left: node, right};
    }
    return node;
  }

  parseFactor() {
    let node = this.parseAtom();
    while ([T_STAR, T_PLUS, T_OPT].includes(this.peek().type)) {
      const op = this.consume().type;
      if (op === T_STAR) {
        this.steps.push({op: 'Kleene Star', sub: node});
        node = {type: 'Star', sub: node};
      } else if (op === T_PLUS) {
        this.steps.push({op: 'One or More (+)', sub: node});
        node = {type: 'Plus', sub: node};
      } else {
        this.steps.push({op: 'Optional (?)', sub: node});
        node = {type: 'Opt', sub: node};
      }
    }
    return node;
  }

  parseAtom() {
    const t = this.peek();
    if (t.type === T_CHAR) {
      this.consume();
      this.steps.push({op: 'Symbol', sym: t.value});
      return {type: 'Char', value: t.value};
    }
    if (t.type === T_EPS) {
      this.consume();
      this.steps.push({op: 'Epsilon ε', sym: 'ε'});
      return {type: 'Eps'};
    }
    if (t.type === T_LPAREN) {
      this.consume();
      const node = this.parseExpr();
      if (this.peek().type !== T_RPAREN)
        throw new Error("Expected closing ')'");
      this.consume();
      return node;
    }
    throw new Error(`Unexpected token: ${t.type} at position ${this.pos}`);
  }
}

/* ─────────────────────── NFA Structure ─────────────────────── */
let stateCounter = 0;
function newState() { return stateCounter++; }

function makeNFA(start, accept, transitions = []) {
  return {start, accept, transitions};
}

// transitions: [{from, label, to}]  label = 'ε' or char

/* ─────────────────────── Thompson's Construction ─────────────────────── */
function buildNFAFromAST(node) {
  switch (node.type) {
    case 'Char': return nfaChar(node.value);
    case 'Eps':  return nfaEps();
    case 'Union': return nfaUnion(buildNFAFromAST(node.left), buildNFAFromAST(node.right));
    case 'Concat': return nfaConcat(buildNFAFromAST(node.left), buildNFAFromAST(node.right));
    case 'Star':   return nfaStar(buildNFAFromAST(node.sub));
    case 'Plus':   return nfaPlus(buildNFAFromAST(node.sub));
    case 'Opt':    return nfaOpt(buildNFAFromAST(node.sub));
    default: throw new Error("Unknown AST node: " + node.type);
  }
}

function nfaChar(c) {
  const s = newState(), a = newState();
  return makeNFA(s, a, [{from: s, label: c, to: a}]);
}

function nfaEps() {
  const s = newState(), a = newState();
  return makeNFA(s, a, [{from: s, label: 'ε', to: a}]);
}

function nfaUnion(M, N) {
  const s = newState(), a = newState();
  return makeNFA(s, a, [
    ...M.transitions, ...N.transitions,
    {from: s, label: 'ε', to: M.start},
    {from: s, label: 'ε', to: N.start},
    {from: M.accept, label: 'ε', to: a},
    {from: N.accept, label: 'ε', to: a},
  ]);
}

function nfaConcat(M, N) {
  return makeNFA(M.start, N.accept, [
    ...M.transitions, ...N.transitions,
    {from: M.accept, label: 'ε', to: N.start},
  ]);
}

function nfaStar(M) {
  const s = newState(), a = newState();
  return makeNFA(s, a, [
    ...M.transitions,
    {from: s, label: 'ε', to: M.start},
    {from: s, label: 'ε', to: a},
    {from: M.accept, label: 'ε', to: M.start},
    {from: M.accept, label: 'ε', to: a},
  ]);
}

function nfaPlus(M) {
  const s = newState(), a = newState();
  return makeNFA(s, a, [
    ...M.transitions,
    {from: s, label: 'ε', to: M.start},
    {from: M.accept, label: 'ε', to: M.start},
    {from: M.accept, label: 'ε', to: a},
  ]);
}

function nfaOpt(M) {
  const s = newState(), a = newState();
  return makeNFA(s, a, [
    ...M.transitions,
    {from: s, label: 'ε', to: M.start},
    {from: s, label: 'ε', to: a},
    {from: M.accept, label: 'ε', to: a},
  ]);
}

function cloneNFA(nfa) {
  return {
    start: nfa.start,
    accept: nfa.accept,
    transitions: nfa.transitions.map(t => ({...t}))
  };
}

function pushBuildStep(title, detail, nfa) {
  buildTrace.push({
    title,
    detail,
    nfa: cloneNFA(nfa)
  });
}

function buildNFAFromASTWithTrace(node) {
  switch (node.type) {
    case 'Char': {
      const nfa = nfaChar(node.value);
      pushBuildStep('Symbol', `Create fragment for '${node.value}'`, nfa);
      return nfa;
    }
    case 'Eps': {
      const nfa = nfaEps();
      pushBuildStep('Epsilon', 'Create epsilon fragment', nfa);
      return nfa;
    }
    case 'Union': {
      const M = buildNFAFromASTWithTrace(node.left);
      const N = buildNFAFromASTWithTrace(node.right);
      const nfa = nfaUnion(M, N);
      pushBuildStep('Union', 'Combine left and right fragments with ε-transitions', nfa);
      return nfa;
    }
    case 'Concat': {
      const M = buildNFAFromASTWithTrace(node.left);
      const N = buildNFAFromASTWithTrace(node.right);
      const nfa = nfaConcat(M, N);
      pushBuildStep('Concatenation', 'Link fragments by ε-transition', nfa);
      return nfa;
    }
    case 'Star': {
      const M = buildNFAFromASTWithTrace(node.sub);
      const nfa = nfaStar(M);
      pushBuildStep('Kleene Star', 'Wrap fragment with star structure', nfa);
      return nfa;
    }
    case 'Plus': {
      const M = buildNFAFromASTWithTrace(node.sub);
      const nfa = nfaPlus(M);
      pushBuildStep('One or More', 'Wrap fragment with plus structure', nfa);
      return nfa;
    }
    case 'Opt': {
      const M = buildNFAFromASTWithTrace(node.sub);
      const nfa = nfaOpt(M);
      pushBuildStep('Optional', 'Allow fragment to be skipped with ε-transition', nfa);
      return nfa;
    }
    default:
      throw new Error('Unknown AST node: ' + node.type);
  }
}

/* ─────────────────────── Epsilon Closure ─────────────────────── */
function epsClosure(states, transitions) {
  const closure = new Set(states);
  const stack   = [...states];
  while (stack.length) {
    const s = stack.pop();
    for (const t of transitions) {
      if (t.from === s && t.label === 'ε' && !closure.has(t.to)) {
        closure.add(t.to);
        stack.push(t.to);
      }
    }
  }
  return [...closure].sort((a,b) => a-b);
}

function move(states, symbol, transitions) {
  const result = new Set();
  for (const s of states) {
    for (const t of transitions) {
      if (t.from === s && t.label === symbol) result.add(t.to);
    }
  }
  return [...result];
}

/* ─────────────────────── Subset Construction (NFA → DFA) ─────────────────────── */
function nfaToDFA(nfa) {
  const alphabet = [...new Set(nfa.transitions.map(t => t.label).filter(l => l !== 'ε'))];
  const startClosure = epsClosure([nfa.start], nfa.transitions);
  const startKey = startClosure.join(',');

  const dfaStates    = new Map(); // key → {id, nfaStates, isAccept}
  const dfaTransitions = [];
  let dfaIdCounter = 0;
  const queue = [startClosure];
  dfaStates.set(startKey, {id: dfaIdCounter++, nfaStates: startClosure, isAccept: startClosure.includes(nfa.accept)});

  while (queue.length) {
    const current = queue.shift();
    const currentKey = current.join(',');
    const currentDFA = dfaStates.get(currentKey);

    for (const sym of alphabet) {
      const moved    = move(current, sym, nfa.transitions);
      const closure  = epsClosure(moved, nfa.transitions);
      if (!closure.length) continue;

      const nextKey = closure.join(',');
      if (!dfaStates.has(nextKey)) {
        dfaStates.set(nextKey, {
          id: dfaIdCounter++, nfaStates: closure,
          isAccept: closure.includes(nfa.accept)
        });
        queue.push(closure);
      }
      dfaTransitions.push({
        from: currentDFA.id,
        to:   dfaStates.get(nextKey).id,
        label: sym
      });
    }
  }

  return {
    states:      [...dfaStates.values()],
    start:       0,
    transitions: dfaTransitions,
    alphabet,
    startNFAStates: startClosure,
    startKey
  };
}

/* ─────────────────────── Layout Engine ─────────────────────── */
// Simple hierarchical left-to-right layout using BFS level assignment
function layoutNFA(nfa) {
  const {transitions, start, accept} = nfa;
  const states = [...new Set([start, accept, ...transitions.flatMap(t => [t.from, t.to])])].sort((a,b)=>a-b);
  const level  = new Map();
  const visited= new Set();
  const queue  = [start];
  level.set(start, 0);
  visited.add(start);

  while (queue.length) {
    const s = queue.shift();
    const lv = level.get(s);
    for (const t of transitions) {
      if (t.from === s && !visited.has(t.to) && t.label !== 'ε') {
        visited.add(t.to);
        level.set(t.to, lv + 1);
        queue.push(t.to);
      }
    }
  }
  // BFS for remaining states (ε-transitions)
  const queue2 = [...visited];
  for (const s of states) {
    if (!level.has(s)) {
      let minNeighbor = Infinity;
      for (const t of transitions) {
        if (t.to === s && level.has(t.from)) minNeighbor = Math.min(minNeighbor, level.get(t.from) + 1);
      }
      level.set(s, minNeighbor === Infinity ? 0 : minNeighbor);
    }
  }

  // Group by level, assign positions
  const levelGroups = new Map();
  for (const [s, lv] of level) {
    if (!levelGroups.has(lv)) levelGroups.set(lv, []);
    levelGroups.get(lv).push(s);
  }

  const HX = 140, HY = 90, MARGIN_X = 80, MARGIN_Y = 60;
  const positions = new Map();

  for (const [lv, group] of levelGroups) {
    const count = group.length;
    group.forEach((s, i) => {
      const x = MARGIN_X + lv * HX;
      const y = MARGIN_Y + (i - (count-1)/2) * HY;
      positions.set(s, {x, y});
    });
  }
  return positions;
}

function layoutDFA(dfa) {
  const states = dfa.states;
  const transitions = dfa.transitions;
  const HX = 150, HY = 100, MARGIN_X = 80, MARGIN_Y = 70;
  const level = new Map();
  const visited = new Set();
  const queue = [0];
  level.set(0, 0);
  visited.add(0);

  while (queue.length) {
    const sid = queue.shift();
    const lv = level.get(sid);
    for (const t of transitions) {
      if (t.from === sid && !visited.has(t.to)) {
        visited.add(t.to);
        level.set(t.to, lv + 1);
        queue.push(t.to);
      }
    }
  }
  for (const s of states) {
    if (!level.has(s.id)) level.set(s.id, 0);
  }

  const levelGroups = new Map();
  for (const s of states) {
    const lv = level.get(s.id) || 0;
    if (!levelGroups.has(lv)) levelGroups.set(lv, []);
    levelGroups.get(lv).push(s.id);
  }

  const positions = new Map();
  for (const [lv, group] of levelGroups) {
    const count = group.length;
    group.forEach((sid, i) => {
      positions.set(sid, {
        x: MARGIN_X + lv * HX,
        y: MARGIN_Y + (i - (count-1)/2) * HY
      });
    });
  }
  return positions;
}

/* ─────────────────────── SVG Rendering ─────────────────────── */
const R = 26; // state radius

function renderNFA(nfa, svgId, contentId, showEps = true, activeStates = new Set(), activeTrans = new Set()) {
  const positions = layoutNFA(nfa);
  const {start, accept, transitions} = nfa;
  const svg = document.getElementById(svgId);
  const g   = document.getElementById(contentId);
  g.innerHTML = '';

  // Compute bounding box
  let maxX = 0, maxY = 0;
  for (const {x,y} of positions.values()) { maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const W = maxX + 120, H = Math.max(maxY + 100, 200);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Draw edges
  const edgeMap = buildEdgeMap(transitions);
  for (const [key, trans] of edgeMap) {
    if (!showEps && trans.every(t => t.label === 'ε')) continue;
    const labels = trans.map(t=>t.label);
    const from = positions.get(trans[0].from);
    const to   = positions.get(trans[0].to);
    if (!from || !to) continue;
    const isSelf = trans[0].from === trans[0].to;
    const isAct  = trans.some(t => activeTrans.has(`${t.from}-${t.label}-${t.to}`));
    const isEps  = labels.every(l => l === 'ε');
    renderEdge(g, from, to, labels, isSelf, isEps, isAct, trans[0].from, trans[0].to, positions, transitions);
  }

  // Draw states
  const allStates = [...new Set([start, accept, ...transitions.flatMap(t=>[t.from,t.to])])];
  for (const s of allStates) {
    const pos = positions.get(s);
    if (!pos) continue;
    const isStart  = s === start;
    const isAccept = s === accept;
    const isActive = activeStates.has(s);
    renderState(g, s, pos.x, pos.y, isStart, isAccept, isActive, R, `q${s}`);
  }

  applyTransform(svgId, contentId);
}

function renderDFA(dfa, svgId, contentId, activeStateId = null, activeTransKey = null) {
  const positions = layoutDFA(dfa);
  const svg = document.getElementById(svgId);
  const g   = document.getElementById(contentId);
  g.innerHTML = '';

  let maxX = 0, maxY = 0;
  for (const {x,y} of positions.values()) { maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const W = maxX + 120, H = Math.max(maxY + 100, 200);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Edges
  const edgeMap = new Map();
  for (const t of dfa.transitions) {
    const k = `${t.from}-${t.to}`;
    if (!edgeMap.has(k)) edgeMap.set(k, []);
    edgeMap.get(k).push(t);
  }

  for (const [key, trans] of edgeMap) {
    const from = positions.get(trans[0].from);
    const to   = positions.get(trans[0].to);
    if (!from || !to) continue;
    const labels = trans.map(t => t.label);
    const isSelf = trans[0].from === trans[0].to;
    const isAct  = activeTransKey && trans.some(t => `${t.from}-${t.label}-${t.to}` === activeTransKey);
    renderEdge(g, from, to, labels, isSelf, false, isAct, trans[0].from, trans[0].to, positions, dfa.transitions);
  }

  // States
  for (const s of dfa.states) {
    const pos = positions.get(s.id);
    if (!pos) continue;
    const isActive = s.id === activeStateId;
    const isDead   = !dfa.transitions.some(t => t.from === s.id) && !s.isAccept && s.id !== dfa.start;
    renderState(g, s.id, pos.x, pos.y, s.id === dfa.start, s.isAccept, isActive, R, `D${s.id}`, isDead);
  }

  applyTransform(svgId, contentId);
}

function buildEdgeMap(transitions) {
  const map = new Map();
  for (const t of transitions) {
    const k = `${t.from}-${t.to}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  return map;
}

function renderState(g, id, x, y, isStart, isAccept, isActive, r, label, isDead = false) {
  // Start arrow
  if (isStart) {
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "line");
    arrow.setAttribute('x1', x - r - 30); arrow.setAttribute('y1', y);
    arrow.setAttribute('x2', x - r - 2);  arrow.setAttribute('y2', y);
    arrow.setAttribute('class', 'start-arrow');
    g.appendChild(arrow);
  }

  // Outer circle
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', r);
  let cls = 'state-circle';
  if (isStart)  cls += ' start';
  if (isAccept) cls += ' accept';
  if (isActive) cls += ' active';
  if (isDead)   cls += ' dead';
  circle.setAttribute('class', cls);
  g.appendChild(circle);

  // Accept inner ring
  if (isAccept) {
    const inner = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    inner.setAttribute('cx', x); inner.setAttribute('cy', y); inner.setAttribute('r', r - 5);
    inner.setAttribute('class', 'state-inner');
    g.appendChild(inner);
  }

  // Label
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute('x', x); text.setAttribute('y', y);
  text.setAttribute('class', 'state-label' + (isActive ? ' active' : ''));
  text.textContent = label;
  g.appendChild(text);
}

function renderEdge(g, from, to, labels, isSelf, isEps, isActive, fromId, toId, positions, allTrans) {
  // Check if reverse edge exists (for curve offset)
  const hasReverse = allTrans.some(t => t.from === toId && t.to === fromId);

  if (isSelf) {
    renderSelfLoop(g, from, labels, isEps, isActive);
  } else if (hasReverse) {
    renderCurvedEdge(g, from, to, labels, isEps, isActive);
  } else {
    renderStraightEdge(g, from, to, labels, isEps, isActive);
  }
}

function renderStraightEdge(g, from, to, labels, isEps, isActive) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx/dist, uy = dy/dist;
  const x1 = from.x + ux * R, y1 = from.y + uy * R;
  const x2 = to.x   - ux * R, y2 = to.y   - uy * R;
  const mx = (x1+x2)/2, my = (y1+y2)/2;

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  let cls = 'edge-path';
  if (isEps)    cls += ' epsilon';
  if (isActive) cls += ' active';
  line.setAttribute('class', cls);
  line.setAttribute('marker-end', isActive ? 'url(#arrowhead-active)' : (isEps ? 'url(#arrowhead)' : 'url(#arrowhead)'));
  g.appendChild(line);

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute('x', mx - uy * 12); text.setAttribute('y', my + ux * 12);
  text.setAttribute('class', 'edge-label' + (isEps ? ' epsilon' : '') + (isActive ? ' active' : ''));
  text.textContent = labels.join(',');
  g.appendChild(text);
}

function renderCurvedEdge(g, from, to, labels, isEps, isActive) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.sqrt(dx*dx+dy*dy)||1;
  const ux = dx/dist, uy = dy/dist;
  const CURVE = 35;
  const cx = (from.x+to.x)/2 - uy*CURVE;
  const cy = (from.y+to.y)/2 + ux*CURVE;

  // Adjust start/end to circle boundary
  const dx1 = cx - from.x, dy1 = cy - from.y;
  const d1 = Math.sqrt(dx1*dx1+dy1*dy1)||1;
  const x1 = from.x + (dx1/d1)*R, y1 = from.y + (dy1/d1)*R;

  const dx2 = cx - to.x, dy2 = cy - to.y;
  const d2 = Math.sqrt(dx2*dx2+dy2*dy2)||1;
  const x2 = to.x + (dx2/d2)*R, y2 = to.y + (dy2/d2)*R;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
  let cls = 'edge-path';
  if (isEps)    cls += ' epsilon';
  if (isActive) cls += ' active';
  path.setAttribute('class', cls);
  path.setAttribute('marker-end', isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)');
  g.appendChild(path);

  const tx = cx - uy*8, ty = cy + ux*8;
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute('x', tx); text.setAttribute('y', ty);
  text.setAttribute('class', 'edge-label' + (isEps ? ' epsilon' : '') + (isActive ? ' active' : ''));
  text.textContent = labels.join(',');
  g.appendChild(text);
}

function renderSelfLoop(g, pos, labels, isEps, isActive) {
  const x = pos.x, y = pos.y;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute('d', `M ${x-10} ${y-R} C ${x-40} ${y-70} ${x+40} ${y-70} ${x+10} ${y-R}`);
  let cls = 'edge-path';
  if (isEps)    cls += ' epsilon';
  if (isActive) cls += ' active';
  path.setAttribute('class', cls);
  path.setAttribute('marker-end', isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)');
  g.appendChild(path);

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute('x', x); text.setAttribute('y', y - R - 28);
  text.setAttribute('class', 'edge-label' + (isEps ? ' epsilon' : '') + (isActive ? ' active' : ''));
  text.textContent = labels.join(',');
  g.appendChild(text);
}

/* ─────────────────────── SVG Pan & Zoom ─────────────────────── */
function applyTransform(svgId, contentId) {
  const g = document.getElementById(contentId);
  g.setAttribute('transform', `translate(${svgOffX},${svgOffY}) scale(${svgScale})`);
}

function zoomIn()  { svgScale = Math.min(svgScale * 1.2, 4);    redrawCurrent(); }
function zoomOut() { svgScale = Math.max(svgScale / 1.2, 0.2);  redrawCurrent(); }
function resetView(){ svgScale = 1; svgOffX = 0; svgOffY = 0;   redrawCurrent(); }

function setupPanZoom() {
  const container = document.getElementById('canvasContainer');
  const svg = document.getElementById('mainSVG');

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    svgScale = Math.max(0.2, Math.min(4, svgScale * factor));
    redrawCurrent();
  }, {passive: false});

  svg.addEventListener('mousedown', e => {
    isDragging = true; dragStartX = e.clientX - svgOffX; dragStartY = e.clientY - svgOffY;
    svg.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    svgOffX = e.clientX - dragStartX; svgOffY = e.clientY - dragStartY;
    applyTransform('mainSVG', 'svgContent');
  });
  window.addEventListener('mouseup', () => { isDragging = false; svg.style.cursor = 'default'; });
}

/* ─────────────────────── Transition Table ─────────────────────── */
function renderTransitionTable(nfa, dfa) {
  const content = document.getElementById('tableContent');
  content.innerHTML = '';

  // NFA table
  {
    const states = [...new Set([nfa.start, nfa.accept, ...nfa.transitions.flatMap(t=>[t.from,t.to])])].sort((a,b)=>a-b);
    const symbols = [...new Set(nfa.transitions.map(t=>t.label))].sort();
    let html = `<div class="table-caption">ε-NFA Transition Table</div>`;
    html += `<div class="table-sub">States: ${states.length} | Transitions: ${nfa.transitions.length}</div>`;
    html += `<div style="overflow-x:auto"><table class="trans-table"><thead><tr>`;
    html += `<th>State</th>`;
    for (const sym of symbols) html += `<th>${sym === 'ε' ? 'ε' : sym}</th>`;
    html += `</tr></thead><tbody>`;
    for (const s of states) {
      const isStart  = s === nfa.start;
      const isAccept = s === nfa.accept;
      const rowClass = isStart ? ' start-row' : (isAccept ? ' accept-row' : '');
      html += `<tr>`;
      html += `<td class="state-col${rowClass}">${isStart ? '→' : ''}${isAccept ? '*' : ''} q${s}</td>`;
      for (const sym of symbols) {
        const tos = nfa.transitions.filter(t => t.from === s && t.label === sym).map(t => `q${t.to}`);
        html += `<td class="${rowClass}">{${tos.join(', ') || '∅'}}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    content.innerHTML += html;
  }

  // DFA table
  if (dfa) {
    const alphabet = dfa.alphabet;
    let html = `<div class="table-caption" style="margin-top:2rem">DFA Transition Table</div>`;
    html += `<div class="table-sub">States: ${dfa.states.length} | Alphabet: {${alphabet.join(', ')}}</div>`;
    html += `<div style="overflow-x:auto"><table class="trans-table"><thead><tr>`;
    html += `<th>State</th>`;
    for (const sym of alphabet) html += `<th>${sym}</th>`;
    html += `</tr></thead><tbody>`;
    for (const s of dfa.states) {
      const isStart  = s.id === dfa.start;
      const isAccept = s.isAccept;
      const rowClass = isStart ? ' start-row' : (isAccept ? ' accept-row' : '');
      html += `<tr>`;
      html += `<td class="state-col${rowClass}">${isStart ? '→' : ''}${isAccept ? '*' : ''} D${s.id}</td>`;
      for (const sym of alphabet) {
        const t = dfa.transitions.find(t => t.from === s.id && t.label === sym);
        html += `<td class="${rowClass}">${t ? `D${t.to}` : '∅'}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    content.innerHTML += html;
  }
}

/* ─────────────────────── Build Stepper ─────────────────────── */
function renderBuildStep(index) {
  currentBuildStep = Math.max(0, Math.min(index, buildTrace.length - 1));
  const step = buildTrace[currentBuildStep];
  if (!step) return;

  document.getElementById('buildStepNumber').textContent = `Step ${currentBuildStep + 1} / ${buildTrace.length}`;
  document.getElementById('buildStepTitle').textContent = step.title;
  document.getElementById('buildStepDetail').textContent = step.detail;
  document.getElementById('buildPrevBtn').disabled = currentBuildStep === 0;
  document.getElementById('buildNextBtn').disabled = currentBuildStep === buildTrace.length - 1;
  document.getElementById('buildFinishBtn').style.display = currentBuildStep === buildTrace.length - 1 ? '' : 'none';

  renderNFA(step.nfa, 'mainSVG', 'svgContent', document.getElementById('showEpsilon').checked);
  document.getElementById('canvasTitle').textContent = `Build Step ${currentBuildStep + 1} / ${buildTrace.length}`;
  highlightBuildStepCard(currentBuildStep);
}

function prevBuildStep() {
  if (currentBuildStep > 0) renderBuildStep(currentBuildStep - 1);
}

function nextBuildStep() {
  if (currentBuildStep < buildTrace.length - 1) renderBuildStep(currentBuildStep + 1);
}

function finishBuild() {
  buildComplete = true;
  showToast('Construction complete. Final automaton is ready.');
  redrawCurrent();
}

function highlightBuildStepCard(activeIndex) {
  const cards = document.querySelectorAll('#stepsGrid .step-card');
  cards.forEach((card, index) => {
    card.classList.toggle('active', index === activeIndex);
  });
}

function renderSteps(steps) {
  const grid = document.getElementById('stepsGrid');
  grid.innerHTML = '';
  steps.forEach((step, i) => {
    const card = document.createElement('div');
    card.className = 'step-card';
    card.style.animationDelay = `${i * 50}ms`;
    card.innerHTML = `
      <div class="step-num">Step ${String(i+1).padStart(2,'0')}</div>
      <div class="step-op">${step.title}</div>
      <div class="step-detail">${step.detail}</div>
    `;
    card.addEventListener('click', () => renderBuildStep(i));
    grid.appendChild(card);
  });
  document.getElementById('parseTreePanel').style.display = steps.length ? '' : 'none';
  highlightBuildStepCard(currentBuildStep);
}

/* ─────────────────────── Main Build Entry Point ─────────────────────── */
function buildAutomaton() {
  const raw = document.getElementById('regexInput').value.trim();
  if (!raw) { showToast("Please enter a regular expression"); return; }

  stateCounter = 0;
  buildTrace = [];
  currentBuildStep = 0;
  buildComplete = false;

  try {
    const tokens = tokenize(raw);
    const parser = new Parser(tokens);
    const ast    = parser.parseExpr();
    if (parser.peek().type !== T_EOF) throw new Error("Unexpected characters after expression");

    const nfa = buildNFAFromASTWithTrace(ast);
    const dfa = nfaToDFA(nfa);

    globalNFA    = nfa;
    globalDFA    = dfa;
    currentRegex = raw;
    svgScale = 1; svgOffX = 0; svgOffY = 0;

    // Update stats
    const allStates = [...new Set([nfa.start, nfa.accept, ...nfa.transitions.flatMap(t=>[t.from,t.to])])];
    const alpha     = [...new Set(nfa.transitions.map(t=>t.label).filter(l=>l!=='ε'))];
    document.getElementById('statStates').textContent = allStates.length;
    document.getElementById('statTrans').textContent  = nfa.transitions.length;
    document.getElementById('statAlpha').textContent  = alpha.length;
    document.getElementById('statDFAStates').textContent = dfa.states.length;
    document.getElementById('statsBar').style.display = 'flex';

    document.getElementById('regexDisplay').textContent = `✓ Parsed: ${raw}`;
    document.getElementById('canvasPlaceholder').style.display = 'none';

    // Render build steps first
    renderSteps(buildTrace);
    renderBuildStep(0);
    renderTransitionTable(nfa, dfa);

    // Update simulate view
    document.getElementById('simRegexDisplay').textContent = `Regex: ${raw}`;
    document.getElementById('simCanvasPlaceholder').style.display = 'none';
    renderDFA(dfa, 'simSVG', 'simSVGContent');

  } catch(e) {
    showToast(`Parse error: ${e.message}`);
    console.error(e);
  }
}

function redrawCurrent() {
  if (!globalNFA) return;
  const showEps = document.getElementById('showEpsilon').checked;
  const showDFA = document.getElementById('showDFA').checked;

  if (!buildComplete && buildTrace.length) {
    if (currentView !== 'nfa') {
      showToast('Complete the build steps to view DFA and transition tables');
      currentView = 'nfa';
      document.getElementById('tab-nfa').classList.add('active');
      document.getElementById('tab-dfa').classList.remove('active');
      document.getElementById('tab-table').classList.remove('active');
    }
    const step = buildTrace[currentBuildStep];
    renderNFA(step.nfa, 'mainSVG', 'svgContent', showEps);
    document.getElementById('canvasTitle').textContent = `Build Step ${currentBuildStep + 1} / ${buildTrace.length}`;
    document.getElementById('canvasContainer').style.display = '';
    document.getElementById('tableContainer').style.display = 'none';
    return;
  }

  if (currentView === 'nfa') {
    renderNFA(globalNFA, 'mainSVG', 'svgContent', showEps);
    document.getElementById('canvasTitle').textContent = 'ε-NFA Visualization';
  } else if (currentView === 'dfa') {
    if (showDFA && globalDFA) {
      renderDFA(globalDFA, 'mainSVG', 'svgContent');
      document.getElementById('canvasTitle').textContent = 'DFA Visualization';
    } else {
      showToast("DFA not available or disabled");
    }
  } else if (currentView === 'table') {
    // Show table
    document.getElementById('canvasContainer').style.display = 'none';
    document.getElementById('tableContainer').style.display = '';
    renderTransitionTable(globalNFA, globalDFA);
    return;
  }
  document.getElementById('canvasContainer').style.display = '';
  document.getElementById('tableContainer').style.display = 'none';
}

/* ─────────────────────── Simulation ─────────────────────── */
function startSimulation() {
  if (!globalDFA) { showToast("Build a regex first"); return; }
  const str = document.getElementById('simInput').value;
  simDFA    = globalDFA;
  simSteps  = buildSimSteps(globalDFA, str);
  simCursor = 0;
  simPlaying= false;
  clearInterval(simTimer);

  renderSimStep(simCursor);
  document.getElementById('simControls').style.display = 'flex';
  document.getElementById('simResult').style.display = 'none';
  buildSimTape(str, -1);
}

function buildSimSteps(dfa, str) {
  const steps = [];
  let current = dfa.start;
  steps.push({stateId: current, charIndex: -1, label: `Start at D${current}`, type: 'start'});

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const t  = dfa.transitions.find(t => t.from === current && t.label === ch);
    if (!t) {
      steps.push({stateId: current, charIndex: i, label: `No transition from D${current} on '${ch}' — REJECT`, type: 'reject', dead: true});
      return steps;
    }
    const transKey = `${t.from}-${t.label}-${t.to}`;
    steps.push({stateId: t.to, charIndex: i, label: `D${current} ─${ch}→ D${t.to}`, transKey, type: 'move'});
    current = t.to;
  }

  const finalState = dfa.states.find(s => s.id === current);
  const accepted   = finalState && finalState.isAccept;
  steps.push({stateId: current, charIndex: str.length, label: accepted ? `Accepted in D${current} ✓` : `D${current} is not an accept state — REJECT`, type: accepted ? 'accept' : 'reject'});
  return steps;
}

function renderSimStep(idx) {
  if (!simSteps || idx < 0 || idx >= simSteps.length) return;
  const step = simSteps[idx];
  const str  = document.getElementById('simInput').value;

  buildSimTape(str, step.charIndex);
  addLog(step);

  renderDFA(simDFA, 'simSVG', 'simSVGContent', step.stateId, step.transKey || null);

  if (step.type === 'accept' || step.type === 'reject') {
    const res = document.getElementById('simResult');
    res.style.display = '';
    res.className = 'sim-result ' + (step.type === 'accept' ? 'accept' : 'reject');
    res.textContent = step.type === 'accept'
      ? `✓ ACCEPTED — "${str}" is in the language`
      : `✗ REJECTED — "${str}" is not in the language`;
  }
}

function buildSimTape(str, activeIdx) {
  const tape = document.getElementById('simTape');
  tape.innerHTML = '';
  if (!str) return;
  for (let i = 0; i < str.length; i++) {
    const cell = document.createElement('div');
    cell.className = 'tape-cell';
    if (i === activeIdx) cell.classList.add('current', 'head');
    else if (i < activeIdx) cell.classList.add('consumed');
    cell.textContent = str[i];
    tape.appendChild(cell);
  }
}

const logEntries = [];
function addLog(step) {
  logEntries.push(step);
  const log = document.getElementById('simLog');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + (step.type || '');
  entry.textContent = `[${String(logEntries.length).padStart(2,'0')}] ${step.label}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function simStep(dir) {
  simCursor = Math.max(0, Math.min(simSteps.length - 1, simCursor + dir));
  renderSimStep(simCursor);
}

function simPlay() {
  if (simPlaying) {
    clearInterval(simTimer); simPlaying = false;
    document.getElementById('simPlayBtn').textContent = '▶ Play';
    return;
  }
  simPlaying = true;
  document.getElementById('simPlayBtn').textContent = '⏸ Pause';
  simTimer = setInterval(() => {
    if (simCursor >= simSteps.length - 1) {
      clearInterval(simTimer); simPlaying = false;
      document.getElementById('simPlayBtn').textContent = '▶ Play';
      return;
    }
    simCursor++;
    renderSimStep(simCursor);
  }, 800);
}

function resetSim() {
  clearInterval(simTimer); simPlaying = false;
  simSteps = []; simCursor = -1;
  document.getElementById('simLog').innerHTML = '';
  document.getElementById('simTape').innerHTML = '';
  document.getElementById('simResult').style.display = 'none';
  document.getElementById('simControls').style.display = 'none';
  logEntries.length = 0;
  if (globalDFA) renderDFA(globalDFA, 'simSVG', 'simSVGContent');
}

/* ─────────────────────── UI Helpers ─────────────────────── */
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('nav-' + view).classList.add('active');
}

function switchCanvas(tab) {
  document.querySelectorAll('.canvas-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  currentView = tab;
  redrawCurrent();
}

function loadExample(regex) {
  document.getElementById('regexInput').value = regex;
  buildAutomaton();
}

function downloadSVG() {
  const svg  = document.getElementById('mainSVG');
  const blob = new Blob([svg.outerHTML], {type: 'image/svg+xml'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'automaton.svg'; a.click();
  URL.revokeObjectURL(url);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

/* ─────────────────────── Event Listeners ─────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupPanZoom();

  document.getElementById('regexInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') buildAutomaton();
  });

  document.getElementById('showEpsilon').addEventListener('change', redrawCurrent);
  document.getElementById('showDFA').addEventListener('change', redrawCurrent);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' && simSteps.length) simStep(1);
    if (e.key === 'ArrowLeft'  && simSteps.length) simStep(-1);
    if (e.key === ' ' && simSteps.length) { e.preventDefault(); simPlay(); }
  });
});
