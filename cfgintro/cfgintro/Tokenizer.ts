import { Token } from "./Token"
import { Grammar } from "./Grammar"

export class Tokenizer {
    grammar: Grammar;
    inputData: string;
    currentLine: number;
    idx: number;
    lineNumber: number;

    constructor(grammar: Grammar) {
        this.grammar = grammar
        this.lineNumber = 1;
        this.idx = 0;
        
    }

    setInput(inputData: string) {
        this.inputData = inputData;
        this.lineNumber = 1;
        this.idx = 0;
        //console.log(inputData);
    }
    
    next(): Token {
        while (this.inputData.charAt(this.idx) == ' ' || this.inputData.charAt(this.idx) == '\n') {
            if (this.inputData[this.idx].includes('\n')) 
                this.lineNumber += 1;

            this.idx += 1;

        }

        if (this.idx >= this.inputData.length-1) {
            return new Token("$", undefined, this.lineNumber);

        }

        for (let sym of this.grammar.mapping.keys()) {
            let rex = this.grammar.mapping.get(sym);
            rex.lastIndex = this.idx; 
            let m = rex.exec(this.inputData);  

            if (m) {
                let lexeme = m[0];
                this.idx += lexeme.length;
                let tmpLine = this.lineNumber;
                
                let newRegExp = new RegExp("[\n]");
                let v = newRegExp.exec(lexeme);
                
                this.lineNumber += v == null ? 0 : v.length;
        
                if (sym !== "WHITESPACE" && sym !== "COMMENT") {
                    //console.log(sym, lexeme, tmpLine, this.idx)
                    return new Token(sym, lexeme, tmpLine);

                }
                else {
                    return this.next();

                }
            }
        }
        throw new Error("Error");
    }
}