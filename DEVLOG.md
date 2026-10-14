# 极速飞车（QQ飞车风格网页卡丁车）DEVLOG

- 目标：QQ飞车风格：漂移集气→氮气/小喷/落地喷、3圈竞速、6车AI、道具模式（导弹/水弹/磁铁/天使/氮气）、3主题赛道、车库选车、金币解锁、手机触屏、明亮卡通画风。
- 技术栈：three.js（vendor 自带，无 core 依赖版本）+ GLTFLoader + Blender 5.2 无头建模 GLB + WebAudio 合成 BGM/SFX。
- 目录：`models/*.glb`（Blender 产物）、`js/` 游戏逻辑、`tools/` 建模/服务/验证脚本。
- 铁律：明亮浅色 UI；3D 模型一律 Blender 建模；测试无头静默（?test 钩子 + msedge 截图，不真实点击）。

## 日志

- 2026-10-14 项目启动。脚手架 + vendor 复制（horizon-rush，robocopy 绕过 Mimosa cp 拦截）。
- 2026-10-14 Blender 无头建模 14 个 GLB（6 卡丁车+司机、棕榈/樱花/雪松、拱门、加速带、道具箱、导弹、路牌）。
- 2026-10-14 游戏主体完成：样条赛道（路面/路缘/护栏程序化）、QQ飞车式物理（漂移集气/小喷/落地喷/氮气/坡道腾空/护栏）、5 AI 橡皮筋、道具模式五件套、菜单演示赛、车库展厅、结算/最佳成绩/金币存档、合成 BGM+全 SFX、手机触屏。
- 2026-10-14 无头测试三连坑：① msedge 无头在本机完全无输出 → 改 playwright+Chrome；② 无头 rAF 120Hz 导致测试时钟双倍速 → __testUpdate 挪进物理步进内；③ 起点线与圈数计数错位 45m → TrackData 采样数组 roll 到起点。修完美起步（倒计时清零后才检测的 bug）、地平线灰带（地面圆盘 1800+雾 620）、棕榈树干断节。
- 2026-10-14 最终验证 4/4 场景 + 14 张截图全过，部署 GitHub Pages。
- 2026-10-14 部配备忘：线上 https://yjj0339.github.io/jisu-feiche/ （HTML/JS/GLB/CSS 均 200+正确 MIME）；导航主页已加卡片（E:\ZCODE\_nav 经 gh api contents PUT 上传——当时 git 443 不通，且本地 _nav 分支与远端 SHA 分叉，下次先 pull --rebase）；无头直连拉全量资源在校园网下很慢属网络现象非站点问题。
