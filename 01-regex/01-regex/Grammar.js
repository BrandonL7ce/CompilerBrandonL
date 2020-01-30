"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Grammar {
    constructor(grammar) {
        this.grammar = grammar;
        let mapping = new Map();
        var newline = grammar.split("\n");
        for (var i = 0; i < newline.length; i++) {
            if (newline[i] == "")
                continue;
            var arrow = newline[i].split(" -> ");
            if (arrow.length == 1)
                throw new Error("missing ->");
            if (mapping.has(arrow[0]))
                throw new Error("Duplicate");
            mapping.set(arrow[0], new RegExp(arrow[1]));
        }
    }
}
exports.Grammar = Grammar;
//# sourceMappingURL=Grammar.js.map