const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const truthDiv = document.getElementById('truth-tables');

let gates = [];
let wires = [];
let draggingGate = null;
let dragOffset = {x:0, y:0};
let connecting = null; // {gateId, port, x, y}
let mouse = {x:0, y:0};
let gateIdCounter = 0;
let longTouchTimer = null;
let editingLabelId = null;
let labelInput = null;

function clamp(x,a,b){return Math.max(a,Math.min(b,x));}

function addGate(type) {
    let inputs = (type==='NOT') ? 1 : (type==='INPUT'||type==='OUTPUT'?1:2);
    gates.push({
        id: (++gateIdCounter) + "_" + type,
        type,
        x: 140 + Math.random()*700,
        y: 120 + Math.random()*350,
        value: false,
        inputs,
        label: type + " " + gateIdCounter
    });
    draw();
    showTruthTables();
}

function gateInputPos(gate, n=0)  {
    let baseY = gate.y + (n-(gate.inputs-1)/2)*22;
    return {x: gate.x-38, y: baseY};
}
function gateOutputPos(gate) {
    return {x: gate.x+38, y: gate.y};
}

function drawGate(gate, highlightIns=[], highlightOut=false) {
    ctx.save();
    ctx.translate(gate.x, gate.y);

    // Kapu téglalap
    ctx.beginPath();
    ctx.roundRect(-32, -30, 64, 60, 12);
    ctx.fillStyle = "#353585";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Kapu felirat
    ctx.fillStyle = "#fff";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(gate.type, 0, 6);

    // Állapot felirat FÖLÖTTE
    ctx.font = "15px monospace";
    ctx.fillStyle = "#FFD600";
    ctx.fillText("State: " + (gate.value?1:0), 0, -38);

    // INPUT pont(ok)
    for (let i=0; i<gate.inputs; ++i) {
        ctx.beginPath();
        ctx.arc(-38, (i-(gate.inputs-1)/2)*22, 9, 0, 2*Math.PI);
        ctx.fillStyle = highlightIns[i] ? "#ff5757" : "#555";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        if (gate.type==="INPUT" && i===0) {
            ctx.beginPath();
            ctx.arc(-38,0,9,0,2*Math.PI);
            ctx.fillStyle = gate.value ? "#57ff7f" : "#222";
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.stroke();
        }
    }
    // OUTPUT pont
    ctx.beginPath();
    ctx.arc(38, 0, 9, 0, 2*Math.PI);
    ctx.fillStyle = highlightOut ? "#57ff7f" : "#555";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    if (gate.type==="OUTPUT") {
        ctx.beginPath();
        ctx.arc(38,0,9,0,2*Math.PI);
        ctx.fillStyle = gate.value ? "#FFD600" : "#222";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.stroke();
    }
    // Felirat szerkesztés helye
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#aaa";
    if (gate.id !== editingLabelId) {
        ctx.fillText(gate.label, 0, 42);
    }
    ctx.restore();
}

function drawWire(wire, highlight=false) {
    const fromGate = gates.find(g=>g.id===wire.from);
    const toGate = gates.find(g=>g.id===wire.to);
    if (!fromGate || !toGate) return;
    let toIn = gateInputPos(toGate, wire.toInput);
    let fromOut = gateOutputPos(fromGate);

    ctx.save();
    ctx.strokeStyle = highlight ? "#ff4040" : "#FFD600";
    ctx.lineWidth = highlight ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(fromOut.x, fromOut.y);
    ctx.bezierCurveTo(fromOut.x+30, fromOut.y, toIn.x-30, toIn.y, toIn.x, toIn.y);
    ctx.stroke();
    ctx.restore();
}

function draw(highlightWireIndex=null) {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    for (let i=0; i<wires.length; ++i)
        drawWire(wires[i], highlightWireIndex===i);

    for (const gate of gates) {
        let highlights = [];
        if (connecting && connecting.type === "input") {
            for (let i=0; i<gate.inputs; ++i) {
                let p = gateInputPos(gate,i);
                highlights[i] = dist(mouse,p)<14;
            }
        }
        let highlightOut = false;
        if (connecting && connecting.type === "output") {
            let p = gateOutputPos(gate);
            highlightOut = dist(mouse,p)<14;
        }
        drawGate(gate, highlights, highlightOut);
    }
    if (connecting) {
        ctx.save();
        ctx.strokeStyle = "#ff5757";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(connecting.x, connecting.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
        ctx.restore();
    }

    // Felirat input mező (HTML) beillesztése, ha szerkesztünk
    if (editingLabelId !== null) {
        const gate = gates.find(g=>g.id===editingLabelId);
        if (gate) showLabelInput(gate);
    } else {
        removeLabelInput();
    }
}

function eventPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
        x: (e.touches?e.touches[0].clientX:e.clientX)-r.left,
        y: (e.touches?e.touches[0].clientY:e.clientY)-r.top
    };
}
function dist(a,b) {
    return Math.hypot(a.x-b.x, a.y-b.y);
}
function wireAt(pos) {
    for (let i=0; i<wires.length; ++i) {
        const fromGate = gates.find(g=>g.id===wires[i].from);
        const toGate = gates.find(g=>g.id===wires[i].to);
        if (!fromGate || !toGate) continue;
        let from = gateOutputPos(fromGate);
        let to = gateInputPos(toGate, wires[i].toInput);
        for (let t=0; t<=1.0; t+=0.05) {
            let x = bezier(from.x, from.x+30, to.x-30, to.x, t);
            let y = bezier(from.y, from.y,   to.y,   to.y, t);
            if (Math.hypot(pos.x-x, pos.y-y) < 7) return i;
        }
    }
    return -1;
}
function bezier(p0,p1,p2,p3,t) {
    return (1-t)**3*p0 + 3*(1-t)**2*t*p1 + 3*(1-t)*t**2*p2 + t**3*p3;
}

// --- Kapuk, kötés, drag ---
canvas.onmousedown = function(e) {
    const pos = eventPos(e); mouse = pos;
    if (e.button === 2) return;

    // Ha címkeszerkesztés van, az inputon belül ne zárjunk le semmit (csak máshol)
    if (editingLabelId && labelInput) {
        // Ha az inputon kívül kattintottak, zárjuk le a szerkesztést!
        let inputRect = labelInput.getBoundingClientRect();
        if (!(e.target === labelInput ||
              (e.clientX >= inputRect.left && e.clientX <= inputRect.right &&
               e.clientY >= inputRect.top && e.clientY <= inputRect.bottom))) {
            let gate = gates.find(g=>g.id===editingLabelId);
            if (gate) commitLabelEdit(gate, labelInput.value);
            draw();
        } else {
            // inputon belül kattintás → semmit ne csináljunk (szerkesztés marad)
            return;
        }
    }

    // Kötés
    for (const gate of gates) {
        let outPos = gateOutputPos(gate);
        if (dist(pos, outPos)<14) {
            connecting = {type:"output", gate: gate.id, x: outPos.x, y: outPos.y};
            draw();
            return;
        }
        if (gate.type==="INPUT") {
            let inPos = gateInputPos(gate,0);
            if (dist(pos,inPos)<14) {
                gate.value = !gate.value;
                runLogic();
                draw();
                return;
            }
        }
    }
    // Drag
    for (let i=gates.length-1; i>=0; --i) {
        const g = gates[i];
        if (pos.x>g.x-32 && pos.x<g.x+32 && pos.y>g.y-30 && pos.y<g.y+30) {
            draggingGate = g;
            dragOffset = {x: pos.x-g.x, y: pos.y-g.y};
            return;
        }
    }
};

canvas.onmousemove = function(e) {
    mouse = eventPos(e);
    if (draggingGate) {
        draggingGate.x = clamp(mouse.x - dragOffset.x, 40, canvas.width-40);
        draggingGate.y = clamp(mouse.y - dragOffset.y, 40, canvas.height-40);
    }
    draw();
};
canvas.onmouseup = function(e) {
    if (connecting && connecting.type === "output") {
        const pos = eventPos(e); mouse = pos;
        for (const gate of gates) {
            for (let i=0;i<gate.inputs;++i) {
                let inPos = gateInputPos(gate,i);
                if (dist(pos,inPos)<16) {
                    if (connecting.gate !== gate.id) {
                        wires = wires.filter(w=>!(w.to===gate.id && w.toInput===i));
                        wires.push({from: connecting.gate, to: gate.id, toInput: i});
                        connecting = null;
                        runLogic();
                        draw();
                        draggingGate = null;
                        return;
                    }
                }
            }
        }
    }
    draggingGate = null;
    connecting = null;
    draw();
};

canvas.oncontextmenu = function(e) {
    e.preventDefault();
    const pos = eventPos(e);

    for (let i=gates.length-1; i>=0; --i) {
        const g = gates[i];
        if (pos.x>g.x-32 && pos.x<g.x+32 && pos.y>g.y-30 && pos.y<g.y+30) {
            wires = wires.filter(w=>w.from!==g.id && w.to!==g.id);
            gates.splice(i,1);
            runLogic();
            draw();
            return false;
        }
    }
    let wi = wireAt(pos);
    if (wi >= 0) {
        wires.splice(wi,1);
        runLogic();
        draw();
        return false;
    }
    return false;
};

canvas.addEventListener('touchstart', function(e) {
    const pos = eventPos(e);
    longTouchTimer = setTimeout(() => {
        for (let i=gates.length-1; i>=0; --i) {
            const g = gates[i];
            if (pos.x>g.x-32 && pos.x<g.x+32 && pos.y>g.y-30 && pos.y<g.y+30) {
                wires = wires.filter(w=>w.from!==g.id && w.to!==g.id);
                gates.splice(i,1);
                runLogic();
                draw();
                return;
            }
        }
        let wi = wireAt(pos);
        if (wi >= 0) {
            wires.splice(wi,1);
            runLogic();
            draw();
            return;
        }
    }, 500);
});
canvas.addEventListener('touchend', function(e){
    if (longTouchTimer) clearTimeout(longTouchTimer);
});
canvas.ontouchmove  = function(e) {canvas.onmousemove(e); e.preventDefault();};

// --- FELIRAT SZERKESZTÉS: dupla kattintás ---
canvas.ondblclick = function(e) {
    const pos = eventPos(e);
    for (let i=gates.length-1; i>=0; --i) {
        const g = gates[i];
        if (pos.x>g.x-32 && pos.x<g.x+32 && pos.y>g.y-30 && pos.y<g.y+30) {
            editingLabelId = g.id;
            draw();
            return;
        }
    }
};

function showLabelInput(gate) {
    removeLabelInput();
    labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = gate.label;
    labelInput.style.position = "absolute";
    labelInput.style.zIndex = 10;
    labelInput.style.fontSize = "13px";
    labelInput.style.left = (canvas.offsetLeft + gate.x - 50) + "px";
    labelInput.style.top = (canvas.offsetTop + gate.y + 24) + "px";
    labelInput.style.width = "100px";
    labelInput.style.background = "#232344";
    labelInput.style.color = "#FFD600";
    labelInput.style.border = "1px solid #888";
    labelInput.style.borderRadius = "6px";
    labelInput.style.padding = "1px 4px";
    document.body.appendChild(labelInput);
    labelInput.focus();
    labelInput.setSelectionRange(0, labelInput.value.length);

    labelInput.onkeydown = function(ev) {
        if (ev.key === "Enter") {
            commitLabelEdit(gate, labelInput.value);
        }
    };
    // Ne zárjuk be blur-re!
}
function commitLabelEdit(gate, value) {
    gate.label = value || gate.label;
    editingLabelId = null;
    removeLabelInput();
    draw();
}
function removeLabelInput() {
    if (labelInput) {
        labelInput.remove();
        labelInput = null;
    }
}

function runLogic() {
    // 1. Minden kaput kivéve az INPUT-ot előkészítünk (töröljük a value-t)
    for (const g of gates) if (g.type!=='INPUT') g.value = false;

    // 2. Addig ismételjük a kiértékelést, amíg nincs változás (fixpoint)
    let changed;
    do {
        changed = false;
        for (const g of gates) {
            if (g.type === 'INPUT') continue;
            let inputs = [];
            for (let i = 0; i < g.inputs; ++i) {
                let wire = wires.find(w => w.to === g.id && w.toInput === i);
                let val = false;
                if (wire) {
                    let fromGate = gates.find(x => x.id === wire.from);
                    val = fromGate ? fromGate.value : false;
                }
                inputs.push(val);
            }
            let prev = g.value;
            if (g.type === 'AND')   g.value = inputs.length ? inputs.every(Boolean) : false;
            if (g.type === 'NAND')  g.value = inputs.length ? !inputs.every(Boolean) : false;
            if (g.type === 'OR')    g.value = inputs.length ? inputs.some(Boolean) : false;
            if (g.type === 'NOR')   g.value = inputs.length ? !inputs.some(Boolean) : false;
            if (g.type === 'XOR')   g.value = inputs.length ? (inputs.filter(Boolean).length % 2 === 1) : false;
            if (g.type === 'XNOR')  g.value = inputs.length ? (inputs.filter(Boolean).length % 2 === 0) : false;
            if (g.type === 'NOT')   g.value = inputs.length ? !inputs[0] : true;
            if (g.type === 'OUTPUT') g.value = inputs.length ? !!inputs[0] : false;
            if (g.value !== prev) changed = true;
        }
    } while (changed);

    draw();
    showTruthTables();
}


function showTruthTables() {
    let html = '';
    for (const g of gates) {
        html += `<div class="tt-title">${g.label} (${g.type})</div>`;
        let ttable = makeTruthTable(g);
        html += truthTableToHTML(ttable, g.type, g.inputs);
    }
    truthDiv.innerHTML = html;
}

function makeTruthTable(gate) {
    let n = gate.inputs;
    if (gate.type==="INPUT"||gate.type==="OUTPUT") n=1;
    let rows = [];
    if (n>2) n=2;
    let vals = [];
    for (let i=0; i<(1<<n); ++i) {
        vals = [];
        for (let k=n-1; k>=0; --k) vals.push(!!(i&(1<<k)));
        let result;
        if (gate.type==='AND')   result = vals.every(Boolean);
        if (gate.type==='NAND')  result = !vals.every(Boolean);
        if (gate.type==='OR')    result = vals.some(Boolean);
        if (gate.type==='NOR')   result = !vals.some(Boolean);
        if (gate.type==='XOR')   result = (vals.filter(Boolean).length % 2 === 1);
        if (gate.type==='XNOR')  result = (vals.filter(Boolean).length % 2 === 0);
        if (gate.type==='NOT')   result = !vals[0];
        if (gate.type==='INPUT') result = vals[0];
        if (gate.type==='OUTPUT') result = vals[0];
        rows.push({inputs: [...vals], out: result});
    }
    return rows;
}

function truthTableToHTML(ttable, type, n) {
    let s = '<table class="tt-table"><tr>';
    for (let i=0;i<n;++i) s += `<th>In${i+1}</th>`;
    s += `<th>Out</th></tr>`;
    for (let row of ttable) {
        s += "<tr>";
        for (let k=0;k<n;++k) s += `<td>${row.inputs[k]?1:0}</td>`;
        s += `<td>${row.out?1:0}</td></tr>`;
    }
    s += "</table>";
    return s;
}

// --- Ha a canvasra kattintunk (bárhova), lezárja a felirat szerkesztést ---
document.addEventListener('mousedown', function(e) {
    if (editingLabelId && labelInput) {
        let inputRect = labelInput.getBoundingClientRect();
        if (!(e.target === labelInput ||
              (e.clientX >= inputRect.left && e.clientX <= inputRect.right &&
               e.clientY >= inputRect.top && e.clientY <= inputRect.bottom))) {
            let gate = gates.find(g=>g.id===editingLabelId);
            if (gate) commitLabelEdit(gate, labelInput.value);
            draw();
        }
    }
});

// ---- SAVE / LOAD ----

function saveCircuit() {
    // Serializáljuk a jelenlegi áramkört
    const data = {
        gates: gates.map(g => ({
            id: g.id,
            type: g.type,
            x: g.x,
            y: g.y,
            value: g.value,
            inputs: g.inputs,
            label: g.label
        })),
        wires: wires.map(w => ({
            from: w.from,
            to: w.to,
            toInput: w.toInput
        })),
        gateIdCounter
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "logic-circuit.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Fájl input (rejtett) kezelése
document.getElementById('loadfile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            // Felülírjuk az aktuális áramkört!
            gates = (data.gates || []).map(g => Object.assign({}, g));
            wires = (data.wires || []).map(w => Object.assign({}, w));
            gateIdCounter = data.gateIdCounter || 0;
            editingLabelId = null;
            removeLabelInput();
            runLogic();
            draw();
        } catch (err) {
            alert("Hiba a fájl betöltésekor: " + err);
        }
    };
    reader.readAsText(file);
    // hogy újra lehessen ugyanazt is betölteni:
    e.target.value = '';
});


draw();
showTruthTables();
