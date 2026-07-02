import { defineEval } from "eve/evals";

// 验证：用户贴代码要 review → 模型应加载 code-review skill
export default defineEval({
  description: "User pastes code and asks for review → should load the code-review skill.",
  async test(t) {
    await t.send(
      "请使用 code-review skill 帮我 review 这段代码：\n```js\nfunction add(a,b){return a+b}\n```",
    );
    t.succeeded();
    t.calledTool("load_skill");
  },
});
