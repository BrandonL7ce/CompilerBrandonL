declare var require: any;
let antlr4 = require('./antlr4')
let Lexer = require('./gramLexer.js').gramLexer;
let Parser = require('./gramParser.js').gramParser
let asmCode: string[] = [];

enum VarType {
    INTEGER,
    FPNUM
}

class ErrorHandler {
    syntaxError(rec: any, sym: any, line: number,
        column: number, msg: string, e: any) {
        console.log("Syntax error:", msg, "on line", line,
            "at column", column);
        throw new Error("Syntax error in ANTLR parse");
    }
}

function ICE() {
    throw new Error("Internal compiler error!");
}

class Token {
    sym: string;
    line: number;
    lexeme: string;
    constructor(sym: string, line: number, lexeme: string) {
        this.sym = sym;
        this.line = line;
        this.lexeme = lexeme;
    }
    toString() {
        return `${this.sym} ${this.line} ${this.lexeme}`
    }
}

export class TreeNode {
    sym: string;
    token: Token;
    children: TreeNode[];
    constructor(sym: string, token: Token) {
        this.sym = sym;
        this.token = token;
        this.children = [];
    }
    toString() {
        function walk(n: any, callback: any) {
            callback(n);
            n.children.forEach((x: any) => {
                walk(x, callback);
            });
        }
        let L: string[] = [];
        L.push("digraph d{");
        L.push(`node [fontname="Helvetica",shape=box];`);
        let counter = 0;
        walk(this, (n: any) => {
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
        walk(this, (n: any) => {
            n.children.forEach((x: any) => {
                L.push(`${n.NUMBER} -> ${x.NUMBER};`);
            });
        });
        L.push("}");
        return L.join("\n");
    }
}

function walk(parser: any, node: any) {
    let p: any = node.getPayload();
    if (p.ruleIndex === undefined) {
        let line: number = p.line;
        let lexeme: string = p.text;
        let ty: number = p.type;
        let sym: string = parser.symbolicNames[ty]
        if (sym === null)
            sym = lexeme.toUpperCase();
        let T = new Token(sym, line, lexeme)
        return new TreeNode(sym, T)
    } else {
        let idx: number = p.ruleIndex;
        let sym: string = parser.ruleNames[idx]
        let N = new TreeNode(sym, undefined)
        for (let i = 0; i < node.getChildCount(); ++i) {
            let child: any = node.getChild(i)
            N.children.push(walk(parser, child));
        }
        return N;
    }
}

function makeAsm(root: TreeNode) {
    asmCode = [];
    labelCounter = 0;
    emit("default rel");
    emit("section .text");
    emit("global main");
    emit("main:");
    programNodeCode(root.children[0]);
    emit("ret");
    emit("section .data");
    return asmCode.join("\n");
}

export function parse(txt: string) {
    let stream = new antlr4.InputStream(txt);
    let lexer = new Lexer(stream);
    let tokens = new antlr4.CommonTokenStream(lexer);
    let parser = new Parser(tokens);
    parser.buildParseTrees = true;
    //this assumes your start symbol is 'start'
    let handler = new ErrorHandler();
    lexer.removeErrorListeners();
    lexer.addErrorListener(handler);
    parser.removeErrorListeners()
    parser.addErrorListener(handler);
    
    let antlrroot = parser.start();
    
    // ...
    let root: TreeNode = walk(parser, antlrroot);
    return makeAsm(root);
}

function emit(instr: string) {
    asmCode.push(instr);

}

function programNodeCode(n: TreeNode) {
    //program -> braceblock
    assertNode(n, "program");
    if (n.sym != "program") {
        ICE();
    }
       
    braceblockNodeCode(n.children[0]);

}

function assertNode(n: TreeNode, sym: string) {
    if (n === undefined)
        throw new Error("n is undefined");
    if (n.sym !== sym) {
        throw new Error("Expected to find node " + sym + " but found " + n.sym);
    }
}

function braceblockNodeCode(n: TreeNode) {
    //braceblock -> LBR stmts RBR
    assertNode(n, "braceblock");
    stmtsNodeCode(n.children[1]);

}

function stmtsNodeCode(n: TreeNode) {
    //stmts -> stmt stmts | lambda
    assertNode(n, "stmts");
    if (n.children.length == 0 || n.children[0].sym == "lambda") {
        return;
    }
       
    stmtNodeCode(n.children[0]);
    stmtsNodeCode(n.children[1]);

}

function stmtNodeCode(n: TreeNode) {
    //stmt -> cond | loop | return-stmt SEMI
    let c = n.children[0];
    switch (c.sym) {
        case "cond":
            condNodeCode(c); break;
        case "loop":
            loopNodeCode(c); break;
        case "returnStmt":
            returnstmtNodeCode(c); break;
        default:
            ICE();

    }

}

function returnstmtNodeCode(n: TreeNode) {
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

function loopNodeCode(n: TreeNode) {
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

function condNodeCode(n: TreeNode) {
    //cond -> IF LP expr RP braceblock |
    //  IF LP expr RP braceblock ELSE braceblock

    if (n.children.length === 5) {
        //no 'else'
        exprNodeCode(n.children[2]);    //leaves result in rax
        emit("pop rax");
        emit("cmp rax, 0");
        var endifLabel = label();
        emit(`je ${endifLabel}`);
        braceblockNodeCode(n.children[4]);
        emit(`${endifLabel}:`);

    } else {
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

function factorNodeCode(n: TreeNode): VarType {
    //factor -> NUM | LP expr RP
    let child = n.children[0];
    switch (child.sym) {
        case "NUM":
            let v = parseInt(child.token.lexeme, 10);
            emit(`push qword ${v}`)
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
        default:
            ICE();
    }
}

function castNodeCode(n: TreeNode): VarType {
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
function exprNodeCode(n: TreeNode): VarType {
    return orexpNodeCode(n.children[0]);
}

function orexpNodeCode(n: TreeNode): VarType {
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
        emit("add rsp,8");      //discard left result (0)
        let andexpType = andexpNodeCode(n.children[2]);
        convertStackTopToZeroOrOneInteger(andexpType);
        emit(`${lbl}:`);
        return VarType.INTEGER;   //always integer, even if float operands
    }
}

function andexpNodeCode(n: TreeNode): VarType {
    //andexp : andexp AND notexp | notexp;
    if (n.children.length === 1)
        return notexpNodeCode(n.children[0]);
    else {
        let andexpType = andexpNodeCode(n.children[0]);
        convertStackTopToZeroOrOneInteger(andexpType);
        let lbl = label();
        emit("cmp qword [rsp], 0");
        emit(`je ${lbl}`);
        emit("add rsp,8");      //discard left result (0)
        let notexpType = notexpNodeCode(n.children[2]);
        convertStackTopToZeroOrOneInteger(notexpType);
        emit(`${lbl}:`);
        return VarType.INTEGER;   //always integer, even if float operands
    }
}

function notexpNodeCode(n: TreeNode): VarType {
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
function relNodeCode(n: TreeNode): VarType {
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
            emit("pop rax");    //second operand
            //first operand is on stack
            // now what?
            emit("cmp [rsp],rax");    //do the compare
            switch (n.children[1].token.lexeme) {
                case ">=": emit("setge al"); break;
                case "<=": emit("setle al"); break;
                case ">": emit("setg  al"); break;
                case "<": emit("setl  al"); break;
                case "==": emit("sete  al"); break;
                case "!=": emit("setne al"); break;
                default: ICE()
            }
            emit("movzx qword rax, al");   //move with zero extend
            emit("mov [rsp], rax");
            return VarType.INTEGER;
        }
        else if (sum1Type == VarType.FPNUM && sum2Type == VarType.FPNUM) {
            emit("pop rax");
            emit("movq xmm1, rax");    //second operand
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
            emit("movq rax, xmm0");   //move with zero extend
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

function sumNodeCode(n: TreeNode): VarType {
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
            emit("pop rbx");    //second operand
            emit("pop rax");    //first operand

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

function termNodeCode(n: TreeNode): VarType {
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
            emit("pop rbx");    //second operand
            emit("pop rax");    //first operand

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

function negNodeCode(n: TreeNode): VarType {
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

function convertStackTopToZeroOrOneInteger(type: VarType) {
    if (type == VarType.INTEGER) {
        emit("cmp qword [rsp], 0");
        emit("setne al");
        emit("movzx rax, al");
        emit("mov [rsp], rax");

    }
    else if (type == VarType.FPNUM)
    {
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



