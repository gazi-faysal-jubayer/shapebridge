// Builds the model tree shown in the Model panel from an OV model (structural types so tests can fake it).
import type { TreeNode } from "../state/store";

export interface OvNode {
  GetId(): number;
  GetName(): string;
  GetChildNodes(): OvNode[];
  GetMeshIndices(): number[];
}
export interface OvModel {
  GetRootNode(): OvNode;
  GetMesh(i: number): { GetName(): string };
}

/** `key(nodeId, meshIndex)` must match OV's MeshInstanceId.GetKey() so tree keys equal picking keys. */
export function buildTree(model: OvModel, key: (nodeId: number, meshIndex: number) => string, rootName: string): TreeNode {
  const walk = (node: OvNode, fallback: string): TreeNode => {
    const meshes: TreeNode[] = node.GetMeshIndices().map((m) => ({
      id: key(node.GetId(), m),
      name: model.GetMesh(m).GetName() || `Mesh ${m + 1}`,
      keys: [key(node.GetId(), m)],
      children: [],
    }));
    const children = node.GetChildNodes().map((c, i) => walk(c, `Part ${i + 1}`));
    const all = [...children, ...meshes];
    // a node holding exactly one mesh and nothing else reads better as that mesh
    if (children.length === 0 && meshes.length === 1) return { ...meshes[0], name: node.GetName() || meshes[0].name };
    return { id: `n${node.GetId()}`, name: node.GetName() || fallback, keys: all.flatMap((c) => c.keys), children: all };
  };
  return walk(model.GetRootNode(), rootName);
}

/** Every key in the tree, used for "show all" and for counting parts. */
export function allKeys(tree: TreeNode | null): string[] {
  return tree ? tree.keys : [];
}
