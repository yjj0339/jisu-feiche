// git 443 不通时经 GitHub API 推送当前 HEAD 到 origin/main（blob→tree→commit→ref）
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

const REPO = 'yjj0339/jisu-feiche';
const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
const ghJson = (args, input) => JSON.parse(gh(args, input));

// 1. 变更清单（相对远端）
const head = gh(['api', `repos/${REPO}/git/ref/heads/main`, '--jq', '.object.sha']).trim();
const diff = execFileSync('git', ['diff', '--name-status', head + '..HEAD'], { encoding: 'utf8' });
const entries = [];
for (const line of diff.trim().split('\n')) {
  if (!line) continue;
  const parts = line.split('\t');
  if (line.startsWith('R')) {
    const [st, oldP, newP] = parts;
    // 重命名 = 删旧 + 增新（按 100% 相似处理也行，但内容变了走 blob）
    entries.push({ path: oldP, mode: '100644', type: 'blob', sha: null });
    const buf = readFileSync(newP);
    const blob = ghJson(['api', `repos/${REPO}/git/blobs`, '--input', '-'],
      JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }));
    entries.push({ path: newP, mode: '100644', type: 'blob', sha: blob.sha });
  } else if (line.startsWith('D')) {
    entries.push({ path: parts[1], mode: '100644', type: 'blob', sha: null });
  } else {
    const p = parts[1];
    const buf = readFileSync(p);
    const blob = ghJson(['api', `repos/${REPO}/git/blobs`, '--input', '-'],
      JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }));
    entries.push({ path: p, mode: '100644', type: 'blob', sha: blob.sha });
  }
}
console.log('entries:', entries.length);

// 2. 树 + 提交
const tree = ghJson(['api', `repos/${REPO}/git/trees`, '--input', '-'],
  JSON.stringify({ base_tree: head, tree: entries }));
const msg = execFileSync('git', ['log', '-1', '--pretty=%B'], { encoding: 'utf8' }).trim();
const commit = ghJson(['api', `repos/${REPO}/git/commits`, '--input', '-'],
  JSON.stringify({ message: msg, tree: tree.sha, parents: [head] }));
gh(['api', '-X', 'PATCH', `repos/${REPO}/git/refs/heads/main`, '--input', '-'],
  JSON.stringify({ sha: commit.sha, force: false }));
console.log('API PUSH OK →', commit.sha);
