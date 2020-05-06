"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const TreeNode_1 = require("./TreeNode");
const Tokenizer_1 = require("./Tokenizer");
const Grammar_1 = require("./Grammar");
var operandStack = [];
var operatorStack = [];
let grammar;
let tokenizer;
let precedence = new Map();
let associativity = new Map();
let arity = new Map();
function parse(input) {
    var prevToken = null;
    SetPrecedence();
    SetAssociativity();
    SetArity();
    SetGrammar();
    tokenizer = new Tokenizer_1.Tokenizer(grammar);
    tokenizer.setInput(input);
    while (true) {
        var t = tokenizer.next();
        if (t.sym == "$")
            break;
        if (t.lexeme == "-")
            if (prevToken == null || prevToken.sym == "LPAREN" || precedence.has(prevToken.sym))
                t.sym = "NEGATE";
        var sym = t.sym;
        if (sym == "NUM" || sym == "ID")
            operandStack.push(new TreeNode_1.TreeNode(t.sym, t));
        else if (sym == "RPAREN") {
            while (operatorStack[operatorStack.length - 1].sym != "LPAREN") {
                doOperation();
            }
            operatorStack.pop();
            if (prevToken.sym == "LPAREN" && operandStack[operandStack.length - 1].sym == "ID") {
                let opNode = operatorStack.pop();
                let c1 = operandStack.pop();
                opNode.addChild(c1);
                operandStack.push(opNode);
            }
        }
        else {
            var assoc = associativity.get(sym);
            if (sym == "LPAREN" && prevToken != null && prevToken.sym == "ID")
                operatorStack.push(new TreeNode_1.TreeNode("func-call", null));
            while (assoc != "right" || arity.get(sym) != 1) {
                if (operatorStack.length == 0) {
                    break;
                }
                let A = operatorStack[operatorStack.length - 1].sym;
                if (assoc == "left" && precedence.get(A) >= precedence.get(sym)) {
                    doOperation();
                }
                else if (assoc == "right" && precedence.get(A) > precedence.get(sym)) {
                    doOperation();
                }
                else {
                    break;
                }
            }
            operatorStack.push(new TreeNode_1.TreeNode(t.sym, t));
        }
        prevToken = t;
    }
    while (operatorStack.length > 0) {
        doOperation();
    }
    //console.log(operandStack);
    return operandStack.pop();
}
exports.parse = parse;
function doOperation() {
    let opNode = operatorStack.pop();
    let c1 = operandStack.pop();
    if (arity.get(opNode.sym) == 2) {
        let c2 = operandStack.pop();
        opNode.addChild(c2);
    }
    opNode.addChild(c1);
    operandStack.push(opNode);
}
function SetPrecedence() {
    precedence.set("COMMA", 0);
    precedence.set("ADDOP", 1);
    precedence.set("MULOP", 2);
    precedence.set("NEGATE", 3);
    precedence.set("BITNOT", 4);
    precedence.set("POWOP", 5);
    precedence.set("func-call", 6);
}
function SetAssociativity() {
    associativity.set("COMMA", "left");
    associativity.set("ADDOP", "left");
    associativity.set("MULOP", "left");
    associativity.set("NEGATE", "right");
    associativity.set("BITNOT", "right");
    associativity.set("POWOP", "right");
    associativity.set("func-call", "left");
}
function SetArity() {
    arity.set("COMMA", 2);
    arity.set("ADDOP", 2);
    arity.set("MULOP", 2);
    arity.set("NEGATE", 1);
    arity.set("BITNOT", 1);
    arity.set("POWOP", 2);
    arity.set("func-call", 2);
}
function SetGrammar() {
    let gramText = "";
    gramText += "NUM -> \\d+\n";
    gramText += "ID -> \\w+\n";
    gramText += "COMMA -> [,]\n";
    gramText += "ADDOP -> [-+]\n";
    gramText += "POWOP -> [*][*]\n";
    gramText += "MULOP -> [*/]\n";
    gramText += "BITNOT -> [~]\n";
    gramText += "LPAREN -> [(]\n";
    gramText += "RPAREN -> [)]\n";
    grammar = new Grammar_1.Grammar(gramText);
}
//# sourceMappingURL=shuntingyard.js.map