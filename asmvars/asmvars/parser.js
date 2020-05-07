"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let antlr4 = require('./antlr4');
let Lexer = require('./gramLexer.js').gramLexer;
let Parser = require('./gramParser.js').gramParser;
let asmCode = [];
let stringPool;
var VarType;
(function (VarType) {
    VarType[VarType["INTEGER"] = 0] = "INTEGER";
    VarType[VarType["FPNUM"] = 1] = "FPNUM";
    VarType[VarType["STRING"] = 2] = "STRING";
})(VarType || (VarType = {}));
class VarInfo {
    //also the line number, if you want
    constructor(t, location) {
        this.location = location;
        this.type = t;
    }
}
class SymbolTable {
    constructor() {
        this.table = new Map();
    }
    get(name) {
        if (!this.table.has(name))
            ICE();
        return this.table.get(name);
    }
    set(name, v) {
        if (this.table.has(name))
            ICE();
        this.table.set(name, v);
    }
    has(name) {
        return this.table.has(name);
    }
}
let symtable = new SymbolTable();
class ErrorHandler {
    syntaxError(rec, sym, line, column, msg, e) {
        console.log("Syntax error:", msg, "on line", line, "at column", column);
        throw new Error("Syntax error in ANTLR parse");
    }
}
function ICE() {
    throw new Error("Internal compiler error!");
}
class Token {
    constructor(sym, line, lexeme) {
        this.sym = sym;
        this.line = line;
        this.lexeme = lexeme;
    }
    toString() {
        return `${this.sym} ${this.line} ${this.lexeme}`;
    }
}
class TreeNode {
    constructor(sym, token) {
        this.sym = sym;
        this.token = token;
        this.children = [];
    }
    toString() {
        function walk(n, callback) {
            callback(n);
            n.children.forEach((x) => {
                walk(x, callback);
            });
        }
        let L = [];
        L.push("digraph d{");
        L.push(`node [fontname="Helvetica",shape=box];`);
        let counter = 0;
        walk(this, (n) => {
            n.NUMBER = "n" + (counter++);
            let tmp = n.sym;
            if (n.token) {
                tmp += "\n";
                tmp += n.token.lexeme;
            }
            tmp = tmp.replace(/&/g, "&amp;");
            tmp = tmp.replace(/</g, "&lt;");
            tmp = tmp.replace(/>/g, "&gt;");
            tmp = tmp.replace(/\n/g, "<br/>");
            L.push(`${n.NUMBER} [label=<${tmp}>];`);
        });
        walk(this, (n) => {
            n.children.forEach((x) => {
                L.push(`${n.NUMBER} -> ${x.NUMBER};`);
            });
        });
        L.push("}");
        return L.join("\n");
    }
}
exports.TreeNode = TreeNode;
function walk(parser, node) {
    let p = node.getPayload();
    if (p.ruleIndex === undefined) {
        let line = p.line;
        let lexeme = p.text;
        let ty = p.type;
        let sym = parser.symbolicNames[ty];
        if (sym === null)
            sym = lexeme.toUpperCase();
        let T = new Token(sym, line, lexeme);
        return new TreeNode(sym, T);
    }
    else {
        let idx = p.ruleIndex;
        let sym = parser.ruleNames[idx];
        let N = new TreeNode(sym, undefined);
        for (let i = 0; i < node.getChildCount(); ++i) {
            let child = node.getChild(i);
            N.children.push(walk(parser, child));
        }
        return N;
    }
}
function makeAsm(root) {
    symtable = new SymbolTable();
    stringPool = new Map();
    asmCode = [];
    labelCounter = 0;
    emit("default rel");
    emit("section .text");
    emit("global main");
    emit("main:");
    programNodeCode(root.children[0]);
    emit("ret");
    emit("section .data");
    outputSymbolTableInfo();
    outputStringPoolInfo();
    return asmCode.join("\n");
}
function parse(txt) {
    let stream = new antlr4.InputStream(txt);
    let lexer = new Lexer(stream);
    let tokens = new antlr4.CommonTokenStream(lexer);
    let parser = new Parser(tokens);
    parser.buildParseTrees = true;
    //this assumes your start symbol is 'start'
    let handler = new ErrorHandler();
    lexer.removeErrorListeners();
    lexer.addErrorListener(handler);
    parser.removeErrorListeners();
    parser.addErrorListener(handler);
    let antlrroot = parser.start();
    // ...
    let root = walk(parser, antlrroot);
    return makeAsm(root);
}
exports.parse = parse;
function emit(instr) {
    asmCode.push(instr);
}
function programNodeCode(n) {
    //program : varDeclList braceblock;
    assertNode(n, "program");
    if (n.sym != "program") {
        ICE();
    }
    vardeclListNodeCode(n.children[0]);
    braceblockNodeCode(n.children[1]);
}
function assertNode(n, sym) {
    if (n === undefined)
        throw new Error("n is undefined");
    if (n.sym !== sym) {
        throw new Error("Expected to find node " + sym + " but found " + n.sym);
    }
}
function braceblockNodeCode(n) {
    //braceblock -> LBR stmts RBR
    assertNode(n, "braceblock");
    stmtsNodeCode(n.children[1]);
}
function stmtsNodeCode(n) {
    //stmts -> stmt stmts | lambda
    assertNode(n, "stmts");
    if (n.children.length == 0 || n.children[0].sym == "lambda") {
        return;
    }
    stmtNodeCode(n.children[0]);
    stmtsNodeCode(n.children[1]);
}
function stmtNodeCode(n) {
    //stmt -> cond | loop | return-stmt SEMI
    let c = n.children[0];
    switch (c.sym) {
        case "cond":
            condNodeCode(c);
            break;
        case "loop":
            loopNodeCode(c);
            break;
        case "returnStmt":
            returnstmtNodeCode(c);
            break;
        case "assign":
            assignNodeCode(c);
            break;
        default:
            ICE();
    }
}
function returnstmtNodeCode(n) {
    //return-stmt -> RETURN expr
    let returnType = exprNodeCode(n.children[1]);
    if (returnType == VarType.INTEGER) {
        emit("pop rax");
        emit("ret");
    }
    else if (returnType == VarType.FPNUM) {
        emit("movq xmm0, [rsp]");
        emit("add rsp, 8");
        emit("cvtsd2si rax, xmm0");
        emit("ret");
    }
}
/*
function exprNodeCode(n: TreeNode) {
    //expr -> NUM
    let d = parseInt(n.children[0].token.lexeme, 10);
    emit(`mov rax, ${d}`);

}
*/
let labelCounter = 0;
function label() {
    let s = "lbl" + labelCounter;
    labelCounter++;
    return s;
}
function loopNodeCode(n) {
    //loop : WHILE LP expr RP braceblock;
    var whileLabel = label();
    var endWhile = label();
    emit(`${whileLabel}:`);
    exprNodeCode(n.children[2]);
    emit("pop rax");
    emit("cmp rax, 0");
    emit(`je ${endWhile}`);
    braceblockNodeCode(n.children[4]);
    emit(`jmp ${whileLabel}`);
    emit(`${endWhile}:`);
}
function condNodeCode(n) {
    //cond -> IF LP expr RP braceblock |
    //  IF LP expr RP braceblock ELSE braceblock
    if (n.children.length === 5) {
        //no 'else'
        exprNodeCode(n.children[2]); //leaves result in rax
        emit("pop rax");
        emit("cmp rax, 0");
        var endifLabel = label();
        emit(`je ${endifLabel}`);
        braceblockNodeCode(n.children[4]);
        emit(`${endifLabel}:`);
    }
    else {
        //...fill this in...
        var endIf = label();
        var endElse = label();
        exprNodeCode(n.children[2]);
        emit("pop rax");
        emit("cmp rax, 0");
        emit(`je ${endIf}`);
        braceblockNodeCode(n.children[4]);
        //else stuff
        emit(`jmp ${endElse}`);
        emit(`${endIf}:`);
        braceblockNodeCode(n.children[6]);
        emit(`${endElse}:`);
    }
}
function factorNodeCode(n) {
    //factor :  NUM | LP expr RP | FPNUM | STRINGCONST | ID;
    let child = n.children[0];
    switch (child.sym) {
        case "NUM":
            let v = parseInt(child.token.lexeme, 10);
            emit(`push qword ${v}`);
            return VarType.INTEGER;
        case "FPNUM":
            let f = parseFloat(child.token.lexeme);
            let s = f.toString();
            if (!s.includes('.'))
                s = s.concat(".0");
            emit(`mov rax, __float64__ (${s})`);
            emit("push rax");
            return VarType.FPNUM;
        case "LP":
            return exprNodeCode(n.children[1]);
        case "cast":
            return castNodeCode(n.children[0]);
        case "STRINGCONST":
            let stringconst = stringconstantNodeCode(n.children[0]);
            emit(`push qword ${stringconst}`);
            return VarType.STRING;
        case "ID":
            if (!symtable.has(n.children[0].token.lexeme))
                ICE();
            let id = symtable.get(n.children[0].token.lexeme);
            emit(`push qword [${id.location}]`);
            return id.type;
        default:
            ICE();
    }
}
function castNodeCode(n) {
    //cast : LP TYPE RP cast | factor;
    if (n.children.length == 1)
        return factorNodeCode(n.children[0]);
    else {
        let castType = castNodeCode(n.children[3]);
        switch (n.children[1].token.lexeme) {
            case "int":
                if (castType == VarType.INTEGER)
                    return VarType.INTEGER;
                else {
                    emit("movq xmm0, [rsp]");
                    emit("add rsp, 8");
                    emit("roundsd xmm0, xmm0, 3");
                    emit("cvtsd2si rax, xmm0");
                    emit("push rax");
                    return VarType.INTEGER;
                }
            case "double":
                if (castType == VarType.FPNUM)
                    return VarType.FPNUM;
                else {
                    emit("pop rax");
                    emit("cvtsi2sd xmm0, rax");
                    emit("sub rsp, 8");
                    emit("movq [rsp], xmm0");
                    return VarType.FPNUM;
                }
            default:
                ICE();
        }
    }
}
//Expressions
function exprNodeCode(n) {
    return orexpNodeCode(n.children[0]);
}
function orexpNodeCode(n) {
    //orexp -> orexp OR andexp | andexp
    if (n.children.length === 1)
        return andexpNodeCode(n.children[0]);
    else {
        //more code
        let orexpType = orexpNodeCode(n.children[0]);
        convertStackTopToZeroOrOneInteger(orexpType);
        let lbl = label();
        emit("cmp qword [rsp], 0");
        emit(`jne ${lbl}`);
        emit("add rsp,8"); //discard left result (0)
        let andexpType = andexpNodeCode(n.children[2]);
        convertStackTopToZeroOrOneInteger(andexpType);
        emit(`${lbl}:`);
        return VarType.INTEGER; //always integer, even if float operands
    }
}
function andexpNodeCode(n) {
    //andexp : andexp AND notexp | notexp;
    if (n.children.length === 1)
        return notexpNodeCode(n.children[0]);
    else {
        let andexpType = andexpNodeCode(n.children[0]);
        convertStackTopToZeroOrOneInteger(andexpType);
        let lbl = label();
        emit("cmp qword [rsp], 0");
        emit(`je ${lbl}`);
        emit("add rsp,8"); //discard left result (0)
        let notexpType = notexpNodeCode(n.children[2]);
        convertStackTopToZeroOrOneInteger(notexpType);
        emit(`${lbl}:`);
        return VarType.INTEGER; //always integer, even if float operands
    }
}
function notexpNodeCode(n) {
    //notexp :  NOT notexp | rel;
    if (n.children.length === 1)
        return relNodeCode(n.children[0]);
    else {
        let notexpType = notexpNodeCode(n.children[1]);
        convertStackTopToZeroOrOneInteger(notexpType);
        emit("xor qword[rsp], 1");
        return VarType.INTEGER;
    }
}
/*
function relexpNodeCode(n: TreeNode): VarType {
    return sumNodeCode(n.children[0]);
}
*/
function relNodeCode(n) {
    //rel |rarr| sum RELOP sum | sum
    if (n.children.length === 1)
        return sumNodeCode(n.children[0]);
    else {
        let sum1Type = sumNodeCode(n.children[0]);
        let sum2Type = sumNodeCode(n.children[2]);
        /*
        if (sum1Type !== VarType.INTEGER || sum2Type != VarType.INTEGER)
            ICE();
        */
        if (sum1Type !== sum2Type)
            ICE();
        if (sum1Type == VarType.INTEGER && sum2Type == VarType.INTEGER) {
            emit("pop rax"); //second operand
            //first operand is on stack
            // now what?
            emit("cmp [rsp],rax"); //do the compare
            switch (n.children[1].token.lexeme) {
                case ">=":
                    emit("setge al");
                    break;
                case "<=":
                    emit("setle al");
                    break;
                case ">":
                    emit("setg  al");
                    break;
                case "<":
                    emit("setl  al");
                    break;
                case "==":
                    emit("sete  al");
                    break;
                case "!=":
                    emit("setne al");
                    break;
                default: ICE();
            }
            emit("movzx qword rax, al"); //move with zero extend
            emit("mov [rsp], rax");
            return VarType.INTEGER;
        }
        else if (sum1Type == VarType.FPNUM && sum2Type == VarType.FPNUM) {
            emit("pop rax");
            emit("movq xmm1, rax"); //second operand
            emit("pop rax");
            emit("movq xmm0, rax");
            //first operand is on stack
            // now what?
            switch (n.children[1].token.lexeme) {
                case ">=":
                    emit("cmpnltsd xmm0, xmm1");
                    break;
                case "<=":
                    emit("cmplesd xmm0, xmm1");
                    break;
                case ">":
                    emit("cmpnlesd  xmm0, xmm1");
                    break;
                case "<":
                    emit("cmpltsd  xmm0, xmm1");
                    break;
                case "==":
                    emit("cmpeqsd  xmm0, xmm1");
                    break;
                case "!=":
                    emit("cmpneqsd xmm0, xmm1");
                    break;
                default:
                    ICE();
            }
            emit("movq rax, xmm0"); //move with zero extend
            emit("mov rbx, __float64__(1.0)");
            emit("and rax, rbx");
            emit("push rax");
            return VarType.FPNUM;
        }
        else {
            ICE();
        }
    }
}
function sumNodeCode(n) {
    assertNode(n, "sum");
    //sum -> sum PLUS term | sum MINUS term | term
    if (n.children.length === 1)
        return termNodeCode(n.children[0]);
    else {
        //...more code...
        let sumType = sumNodeCode(n.children[0]);
        let termType = termNodeCode(n.children[2]);
        //if (sumType !== VarType.INTEGER || termType != VarType.INTEGER)
        //ICE();
        if (sumType != termType)
            ICE();
        if (sumType == VarType.INTEGER && termType == VarType.INTEGER) {
            emit("pop rbx"); //second operand
            emit("pop rax"); //first operand
            switch (n.children[1].sym) {
                case "PLUS":
                    emit("add rax, rbx");
                    break;
                case "MINUS":
                    emit("sub rax, rbx");
                    break;
                default:
                    ICE();
            }
            emit("push rax");
            return VarType.INTEGER;
        }
        else if (sumType == VarType.FPNUM && termType == VarType.FPNUM) {
            emit("movq xmm1, [rsp]");
            emit("add rsp, 8");
            emit("movq xmm0, [rsp]");
            emit("add rsp, 8");
            switch (n.children[1].sym) {
                case "PLUS":
                    emit("addsd xmm0, xmm1");
                    break;
                case "MINUS":
                    emit("subsd xmm0, xmm1");
                    break;
                default:
                    ICE();
            }
            emit("sub rsp, 8");
            emit("movq[rsp], xmm0");
            return VarType.FPNUM;
        }
        else {
            ICE();
        }
    }
}
function termNodeCode(n) {
    if (n.children.length == 1) {
        return negNodeCode(n.children[0]);
    }
    else {
        //...more code...
        let termType = termNodeCode(n.children[0]);
        let negType = negNodeCode(n.children[2]);
        /*
        if (sumType !== VarType.INTEGER || termType != VarType.INTEGER)
            ICE();
        */
        if (negType != termType)
            ICE();
        if (termType == VarType.INTEGER && negType == VarType.INTEGER) {
            emit("pop rbx"); //second operand
            emit("pop rax"); //first operand
            switch (n.children[1].sym) {
                case "MULOP":
                    if (n.children[1].token.lexeme == '*') {
                        emit("imul rax, rbx");
                        emit("push rax");
                        break;
                    }
                    else if (n.children[1].token.lexeme == '/') {
                        emit("xor qword rdx, rdx");
                        emit("mov rdx, 0");
                        emit("idiv rbx");
                        emit("push rax");
                        break;
                    }
                    else if (n.children[1].token.lexeme == '%') {
                        emit("xor qword rdx, rdx");
                        emit("idiv rbx");
                        emit("push rdx");
                        break;
                    }
                default:
                    ICE();
            }
            return VarType.INTEGER;
        }
        else if (termType == VarType.FPNUM && negType == VarType.FPNUM) {
            emit("movq xmm1, [rsp]");
            emit("add rsp, 8");
            emit("movq xmm0, [rsp]");
            emit("add rsp, 8");
            switch (n.children[1].sym) {
                case "MULOP":
                    if (n.children[1].token.lexeme == '*') {
                        emit("mulsd xmm0, xmm1");
                        break;
                    }
                    else if (n.children[1].token.lexeme == '/') {
                        emit("divsd xmm0, xmm1");
                        break;
                    }
                    else if (n.children[1].token.lexeme == '%') {
                        emit("divsd xmm0, xmm1");
                        break;
                    }
                default:
                    ICE();
            }
            emit("sub rsp, 8");
            emit("movq [rsp], xmm0");
            return VarType.FPNUM;
        }
        else {
            ICE();
        }
    }
}
function negNodeCode(n) {
    //neg :  MINUS neg | cast;
    if (n.children.length === 1)
        return castNodeCode(n.children[0]);
    else {
        let negType = negNodeCode(n.children[1]);
        if (negType == VarType.INTEGER) {
            emit("pop rax");
            emit("xor qword rbx, rbx");
            emit("sub rbx, rax");
            emit("push rbx");
            return VarType.INTEGER;
        }
        else if (negType == VarType.FPNUM) {
            emit("movq xmm0, [rsp]");
            emit("xorps xmm1, xmm1");
            emit("subsd xmm1, xmm0");
            emit("movq[rsp], xmm1");
            return VarType.FPNUM;
        }
    }
}
function convertStackTopToZeroOrOneInteger(type) {
    if (type == VarType.INTEGER) {
        emit("cmp qword [rsp], 0");
        emit("setne al");
        emit("movzx rax, al");
        emit("mov [rsp], rax");
    }
    else if (type == VarType.FPNUM) {
        emit("movq xmm1, [rsp]");
        emit("add rsp, 8");
        emit("xorps xmm2, xmm2");
        emit("cmpneqsd xmm1, xmm2");
        emit("movq rax, xmm1");
        emit("and qword rax, 1");
        emit("push rax");
    }
    else {
        ICE();
    }
}
function vardeclListNodeCode(n) {
    //varDeclList: varDecl SEMI varDeclList | lambda;
    if (n.children.length == 0 || n.children[0].sym == "lambda")
        return;
    else {
        vardeclNodeCode(n.children[0]);
        vardeclListNodeCode(n.children[2]);
    }
}
function vardeclNodeCode(n) {
    //var-decl -> TYPE ID
    let vname = n.children[1].token.lexeme;
    let vtype = typeNodeCode(n.children[0]);
    symtable.set(vname, new VarInfo(vtype, label()));
}
function typeNodeCode(n) {
    switch (n.token.lexeme) {
        case "int":
            return VarType.INTEGER;
        case "double":
            return VarType.FPNUM;
        case "string":
            return VarType.STRING;
        default:
            ICE();
    }
}
function assignNodeCode(n) {
    // assign -> ID EQ expr
    let t = exprNodeCode(n.children[2]);
    let vname = n.children[0].token.lexeme;
    if (symtable.get(vname).type !== t)
        ICE();
    moveBytesFromStackToLocation(symtable.get(vname).location);
}
function moveBytesFromStackToLocation(loc) {
    emit("pop rax");
    emit(`mov [${loc}], rax`);
}
function stringconstantNodeCode(n) {
    let s = n.token.lexeme;
    s = s.substring(1, s.length - 1);
    if (!stringPool.has(s))
        stringPool.set(s, label());
    return stringPool.get(s); //return the label
}
function outputSymbolTableInfo() {
    for (let vname of symtable.table.keys()) {
        let vinfo = symtable.get(vname);
        emit(`${vinfo.location}:`);
        emit("dq 0");
    }
}
function outputStringPoolInfo() {
    for (let key of stringPool.keys()) {
        let lbl = stringPool.get(key);
        emit(`${lbl}:`);
        for (let i = 0; i < key.length; ++i) {
            emit(`db ${key.charCodeAt(i)}`);
        }
        emit("db 0"); //null terminator
    }
}
//# sourceMappingURL=parser.js.map