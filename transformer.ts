import * as ts from 'typescript';

export default function transformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
    return (context: ts.TransformationContext) => (file: ts.SourceFile) => visitNodes(file, program, context);
}

function visitNodes(file: ts.SourceFile, program: ts.Program, context: ts.TransformationContext): ts.SourceFile;
function visitNodes(node: ts.Node, program: ts.Program, context: ts.TransformationContext): ts.Node;

function visitNodes(node: ts.Node, program: ts.Program, context: ts.TransformationContext): ts.Node {
    const newNode = statements(node, program, context);
    if (node !== newNode) {
        return newNode;
    }

    return ts.visitEachChild(node, childNode => visitNodes(childNode, program, context), context);
}

const CONTROL_STATEMENT_TAG_NAMES = ['If'];
const isControlStatementNode = (node: ts.Node): boolean => {
    return ts.isJsxOpeningElement(node) && CONTROL_STATEMENT_TAG_NAMES.indexOf(
        (node as ts.JsxOpeningElement).tagName.getFullText()
    ) !== -1;
};

const getChildren = (node: ts.Node): ts.Node[] => node.getChildren().slice(1, node.getChildCount() - 1);

function* elems(node: ts.Node): Iterable<ts.Node> {
    yield node;
    for (const cn of node.getChildren()) {
        yield* elems(cn);
    }
}

const filter = <T>(predicate: (item: T) => boolean) => function* (iterable: Iterable<T>): Iterable<T> {
    for (const item of iterable) {
        if (predicate(item)) {
            yield item;
        }
    }
};

const getConditionNode = (node: ts.Node): ts.Expression | null => {
    const [result] = filter(ts.isJsxAttribute)(elems(node));
    return result.getChildAt(2) as ts.Expression;
};

const trimStart = (from: string) => from.replace(/^\r?\n[\s\t]*/, '');
const token = () => ts.createToken(ts.SyntaxKind.DotDotDotToken);

const transformIfNode = (node: ts.JsxOpeningElement, parent: ts.JsxElement): ts.Node => {
    const cnd = getConditionNode(node);
    if (cnd == null) {
        return node;
    }

    const nodeChild = getChildren(parent);
    return ts.createJsxExpression(
        token(),
        ts.createLogicalAnd(
            cnd.getChildAt(1) as ts.Expression,
            ts.createArrayLiteral(
                nodeChild[0]
                    .getChildren()
                    .filter(
                        node => ts.isJsxElement(node)
                                || ts.isJsxExpression(node)
                                || ts.isJsxText(node)
                    ).map(
                        node => ts.isJsxText(node) ?
                                    ts.createLiteral(trimStart(node.getFullText()))
                                    : node
                    ) as ts.Expression[]
            )
        )
    )
}

const statements = (node: ts.Node, program: ts.Program, ctx: ts.TransformationContext): ts.Node => {
    const child = node.getChildAt(0);
    if (ts.isJsxElement(node) && isControlStatementNode(child)) {
        return transformIfNode(<ts.JsxOpeningElement>child, node);
    }

    return node;
};
