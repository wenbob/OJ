import { assertDestructiveDbOperationAllowed } from "../src/lib/destructiveDbGuard";

assertDestructiveDbOperationAllowed();
console.log("破坏式数据库操作安全检查通过");
