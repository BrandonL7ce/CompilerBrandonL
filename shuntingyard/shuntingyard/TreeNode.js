"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TreeNode {
    constructor(sym, token) {
        this.sym = sym;
        this.token = token;
        this.children = [];
    }
    addChild(newbie) {
        this.children.push(newbie);
    }
}
exports.TreeNode = TreeNode;
//# sourceMappingURL=TreeNode.js.map