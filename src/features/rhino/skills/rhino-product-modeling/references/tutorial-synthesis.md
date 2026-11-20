# 教程来源与证据边界

## 资料状态

本 skill 根据用户提供的《Rhino 通用产品建模与验收》文档整理。以下“已读取”“已核对”的范围、日期与总结均为原文记载，不是本次整理者重新检索、观看或实操的声明。

原文记载检索日期为 2026-11-18。本次仅整理用户文档，未重新访问下列网页、下载教材、观看视频或在 Rhino 中复现，因此不保证链接、版本和页面内容维持原状。需要据此回答新问题或编写版本相关操作时，再查看相应官方原文与实际环境。

本包不附带第三方教材、视频或模型。不把课程宣传中的 A 面表述当作项目认证，也不根据未观看内容推测讲师操作参数。

## A 原文记载已读取的教程

### A1 Alejandro Zapata 的 Master Rhino Surfacing

- 原文列出的作者网站：[learnrhino.com](https://learnrhino.com/)。
- 原文列出的公开英文 PDF：[Master Rhino Surfacing](https://learnrhino.com/downloads/Master_Rhino_Surfacing-Final_Version.pdf)。
- 原文记录的读取范围：PDF 物理页 5–12、22–25、47–50、70–72、144–146、211–213、273–275，含目录和部分汽车部位操作片段。原文称全书 1279 页，未逐页通读、未操作复现；该页数本次未复核。
- 原文方法总结：先设置尺度与参考，再建立基础曲线和分区车身，最后处理细节；用较少控制点与曲率梳整理输入，用辅助曲面投影或求交建立空间线；分开管理构建曲线与曲面，并分阶段保存。
- 适用边界：原文记载该书模型服务于渲染而非生产。特定车型的点数、偏移与误差不能直接成为其他项目阈值；命令与界面须按安装版本核对。

### A2 McNeel 的扫描网格逆向建模案例

- 来源：[Reverse Engineer a Scanned Mesh](https://www.rhino3d.com/docs/guides/modeling/reverse-engineer-scan/)。
- 原文记录的读取范围：整页文字步骤；未观看嵌入视频，未运行示例模型。
- 原文方法总结：以翼子板和引擎盖扫描为参考，分块建面并用截面对照形状；匹配相邻边，调点时保护已有边界条件；复杂轮廓可先建立四边底层面再修剪，结合连续性与反射检查。
- 应用判断：采用“分块—截面对照—接面—保护邻边—复查”的返修思路；扫描与照片的输入条件不同，不能混用精度结论。
- 版本边界：原文记载案例使用 Rhino 9 工具。SoftTransform、控制多边形对齐和 GlobalEdgeContinuity 是否可用，须按实际版本和接口重新确认。

## B 原文记载已读的官方命令或理论资料

这些链接是进一步核对的入口；下表约束整理自原文，不表示已为当前 Rhino 版本重新核对所有参数。

| 官方来源 | 原文提炼的约束 | 用于本流程 |
| --- | --- | --- |
| [曲线连续性](https://www.rhino3d.com/docs/guides/modeling/rhino-continuity-curves/) | 曲率梳检查输入；次数与控制点结构有关，升阶不会自动消除缺陷 | 骨架曲线 |
| [曲面连续性](https://www.rhino3d.com/docs/guides/modeling/rhino-continuity-surfaces/) | 区分位置、相切、曲率连接；边界附近控制点行参与约束 | 拆面和接面 |
| [Sweep2](https://docs.mcneel.com/rhino/8/help/en-us/commands/sweep2.htm) | 两轨和有序截面；核对结构兼容、端点与连续性选项条件 | 双轨建面 |
| [NetworkSrf](https://docs.mcneel.com/rhino/8/help/en-us/commands/networksrf.htm) | 两族曲线正确交叉；不要假定平滑拟合自动保留硬折线 | 网络建面 |
| [EdgeSrf](https://docs.mcneel.com/rhino/8/help/en-us/commands/edgesrf.htm) | 2 至 4 条边界；三边闭合输入可能有奇异点 | 底层曲面 |
| [MatchSrf](https://docs.mcneel.com/rhino/8/help/en-us/commands/matchsrf.htm) | 修改侧为未修剪边；接近目标时较可靠；保护对端并复查其他边 | 接面返修 |
| [BlendSrf](https://docs.mcneel.com/rhino/8/help/en-us/commands/blendsrf.htm) | 连续性、过渡空间、方向和手柄共同影响形状 | 过渡面 |
| [Zebra](https://docs.mcneel.com/rhino/8/help/en-us/commands/zebra.htm) | 属于视觉判断；分析网格影响观察 | 阶段及最终视觉检查 |

Rhino 8 命令链接和原文中其他版本案例并列，不表示版本兼容已经验证。

## C 只有介绍或目录线索的课程

- [Concept Car 3D Modeling Training](https://www.rhinotutorials.online/courses/concept-car-3d-modeling-training/)：原文仅核对课程目录，涉及轮子、车身、光顺、风挡、悬架等。仅用作部件覆盖线索，不据此编造建面参数或讲师步骤。
- [xNURBS 官方教程](https://www.xnurbs.com/tutorial/)：原文仅核对目录中后视镜、G2 转角及 H6 Evolution 汽车案例。可作为后续可选插件研究入口，视频细节和插件实操未验证，不是必需依赖。
- [B 站汽车犀牛建模详解](https://www.bilibili.com/video/BV1ZW411X7Z3/)：原文核对分集目录，涉及宝马 X5 参考图、曲线、主面、保险杠和细节等；编号存在跳跃，不能称为完整系列。原始讲师及授权来源未确认，不以未观看内容作为方法依据。

## D 本流程的综合规则

以下是面向 AI 执行的流程设计，不归因于某一本教程：

- 按对象、曲面、边界及依赖编号，围绕几何依赖安排操作。
- 用对象范围、阈值、测量方法、证据和四种状态管理验收。
- 将数值连续性与视觉反射分开，不以一类证据替代另一类。
- 修改后使相关旧检查失效，安排相邻区域和下游部件复查。
- 先检测真实操作能力；无软件连接时提供明确未验证的降级输出。
- 把原生重开、导出回读、部件独立性和恢复点纳入交付。

## 后续补充来源的格式

只在当前任务需要时补读相关章节，记录：来源与作者、访问日期、实际读取范围、简短方法总结、适用条件、未验证事项。将新的实际阅读与本文件继承的历史记录分开，不将目录、宣传或未观看视频写成实操证据。
