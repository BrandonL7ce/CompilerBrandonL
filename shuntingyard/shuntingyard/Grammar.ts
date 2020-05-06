import { error } from "util";

export class Grammar {
    grammar: string;
    mapping: Map<string, RegExp>;
    symbols: Set<string>;
    
    constructor(grammar: string) {
        this.grammar = grammar;
        this.mapping = new Map();
        this.symbols = new Set();

        var nextline = false;
        var previousSym = new Set<string>();
        var nextSym = new Array<string>();
        this.mapping.set("WHITESPACE", new RegExp(/(\s|\n)+/, 'gy'));
        var newline = grammar.split("\n");
      
        for (var i = 0; i < newline.length; i++) {
            if (newline[i] == "")
            {
                nextline = true;
                continue;
            }
            
            var arrow = newline[i].split(" -> ");

            if (arrow.length < 2) 
                throw new Error("missing ->");
            //Double Check
            if (this.mapping.has(arrow[0]) && nextline == false)
                throw new Error("Duplicate");

            else if (this.mapping.has(arrow[0]) && nextline == true) {
                var tmp = this.getRegex(arrow[0]).source;
                tmp = tmp + " | " + arrow[1];
                this.mapping.set(arrow[0], new RegExp(tmp));
            }

            else {
                this.mapping.set(arrow[0], new RegExp(arrow[1], 'y'));
                this.symbols.add(arrow[0]);
                if (nextline == true)
                    nextSym.push(arrow[0]);
            }
            
        }

        for (var i = 0; i < nextSym.length; i++)
        {
            var rex = this.getRegex(nextSym[i]).source;
            var tmp1 = rex.split(" | ");

            for (var j = 0; j < tmp1.length; j++)
            {
                var tmp2 = tmp1[j].split(" ");

                for (var k = 0; k < tmp2.length; k++)
                    previousSym.add(tmp2[k]);
                
            }

        }

        var alreadyUsed = Array.from(previousSym.values());
        var sym = Array.from(this.symbols);
        for (var i = 0; i < alreadyUsed.length; i++)
        {
            if (!this.symbols.has(alreadyUsed[i]) && alreadyUsed[i] != "")
                throw new error("Symbol is undefined");
        }

        for (var i = 0; i < sym.length; i++)
        {
            if (!previousSym.has(sym[i]))
            {
                //throw new error("Symbol is unused");
            }
                
        }
      
        //this.Printmap();

    }

    Printmap() {
        for (let i of this.mapping.keys()) {
            console.log(i + " , " + this.mapping.get(i));
        }
            
    }

    getRegex(sym: string) {
        return this.mapping.get(sym);
    }
}