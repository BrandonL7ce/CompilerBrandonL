export class Grammar {
    grammar: string;
    mapping: Map<string, RegExp>;
    

    constructor(grammar: string) {
        this.grammar = grammar;
        this.mapping = new Map();

        var newline = grammar.split("\n");
      
        for (var i = 0; i < newline.length; i++) {
            if (newline[i] == "") 
                continue;
            
            var arrow = newline[i].split(" -> ");

            if (arrow.length == 1) 
                throw new Error("missing ->");

            if (this.mapping.has(arrow[0])) 
                throw new Error("Duplicate");
            
            this.mapping.set(arrow[0], new RegExp(arrow[1], 'y'));

        }
        this.Printmap();

    }


    Printmap() {
        for (let i of this.mapping.keys()) {
            console.log(i + " , " + this.mapping.get(i));
        }
            
    }
}