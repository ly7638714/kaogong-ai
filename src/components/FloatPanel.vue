<script setup>
import { ref, computed, onMounted } from 'vue'
import { store, saveMyMem, saveWqs, saveNotes } from '../store'
import { chatOnce, activeCfg } from '../api'
import { showToast } from '../utils/toast'

// ===== 内置常识库（按领域分类，可筛选/搜索）=====
const CHANGSHI = [
  { t: '人类命运共同体：共建“一带一路”倡议，推动构建人类命运共同体。', cat: '政治理论' },
  { t: '乡村振兴战略：产业兴旺、生态宜居、乡风文明、治理有效、生活富裕二十字总要求。', cat: '政治理论' },
  { t: '“枫桥经验”：发动和依靠群众，坚持矛盾不上交，就地解决。', cat: '政治理论' },
  { t: '新发展格局：以国内大循环为主体、国内国际双循环相互促进。', cat: '政治理论' },
  { t: '总体国家安全观：以人民安全为宗旨，以政治安全为根本。', cat: '政治理论' },
  { t: '宪法规定：中华人民共和国的一切权力属于人民。', cat: '法律' },
  { t: '行政处罚法：处罚法定、公正公开、处罚与教育相结合原则。', cat: '法律' },
  { t: '民法典：自甘风险、好意同乘等规则写入侵权责任编。', cat: '法律' },
  { t: '刑法：正当防卫明显超过必要限度造成重大损害的，应当负刑事责任但应减轻或免除处罚。', cat: '法律' },
  { t: '民事诉讼：谁主张谁举证为一般原则。', cat: '法律' },
  { t: '我国首艘国产大型邮轮“爱达·魔都号”2024年投入运营。', cat: '科技' },
  { t: 'C919大型客机是中国首款按照国际适航标准研制的干线客机。', cat: '科技' },
  { t: '人工智能大模型：以ChatGPT、DeepSeek等为代表的生成式AI快速发展。', cat: '科技' },
  { t: '6G研发、脑机接口、可控核聚变（人造太阳）是前沿科技方向。', cat: '科技' },
  { t: '“东数西算”工程：把东部算力需求有序引导到西部。', cat: '科技' },
  { t: '秦始皇统一六国后推行郡县制、书同文、车同轨、统一度量衡。', cat: '人文历史' },
  { t: '汉初“文景之治”；唐太宗“贞观之治”；唐玄宗“开元盛世”。', cat: '人文历史' },
  { t: '四大书院：应天书院、岳麓书院、白鹿洞书院、嵩阳书院。', cat: '人文历史' },
  { t: '京剧四大名旦：梅兰芳、程砚秋、尚小云、荀慧生。', cat: '人文历史' },
  { t: '《清明上河图》为北宋张择端所作，描绘汴京繁华。', cat: '人文历史' },
  { t: '中国第一大淡水湖是鄱阳湖；第一大咸水湖是青海湖。', cat: '地理国情' },
  { t: '世界最高峰珠穆朗玛峰海拔8848.86米，位于中尼边境。', cat: '地理国情' },
  { t: '中国四大高原：青藏高原、内蒙古高原、黄土高原、云贵高原。', cat: '地理国情' },
  { t: '中国南北分界线：秦岭—淮河一线。', cat: '地理国情' },
  { t: '海南自由贸易港：全岛封关运作，实行“一线放开、二线管住”。', cat: '经济' },
  { t: '货币政策工具：存款准备金率、再贴现、公开市场操作（三大法宝）。', cat: '经济' },
  { t: '供给侧结构性改革：去产能、去库存、去杠杆、降成本、补短板。', cat: '经济' },
  { t: '刷牙用温水、饭后不宜立即剧烈运动；烫伤先冲凉水降温。', cat: '生活常识' },
  { t: '垃圾分类：可回收物、有害垃圾、厨余垃圾、其他垃圾。', cat: '生活常识' },
  { t: '灭火器使用口诀：提、拔、握、压；油锅起火盖锅盖。', cat: '生活常识' },

  { t: '五位一体总体布局：经济建设、政治建设、文化建设、社会建设、生态文明建设。', cat: '政治理论' },
  { t: '四个全面战略布局：全面建设社会主义现代化国家、全面深化改革、全面依法治国、全面从严治党。', cat: '政治理论' },
  { t: '四个意识：政治意识、大局意识、核心意识、看齐意识。', cat: '政治理论' },
  { t: '四个自信：道路自信、理论自信、制度自信、文化自信。', cat: '政治理论' },
  { t: '两个维护：坚决维护党中央核心、全党的核心地位，坚决维护党中央权威和集中统一领导。', cat: '政治理论' },
  { t: '党的根本宗旨是全心全意为人民服务。', cat: '政治理论' },
  { t: '我国社会主要矛盾：人民日益增长的美好生活需要和不平衡不充分的发展之间的矛盾。', cat: '政治理论' },
  { t: '“两个一百年”奋斗目标：建党一百年全面建成小康社会（已实现），建国一百年建成社会主义现代化强国。', cat: '政治理论' },
  { t: '宪法的修改由全国人大常委会或1/5以上全国人大代表提议，由全国人大以全体代表2/3以上多数通过。', cat: '法律' },
  { t: '我国最高国家权力机关是全国人民代表大会，每届任期5年。', cat: '法律' },
  { t: '行政法规的制定主体是国务院。', cat: '法律' },
  { t: '年满18周岁、未被依法剥夺政治权利的公民有选举权和被选举权。', cat: '法律' },
  { t: '《民法典》2021年1月1日起施行，是新中国第一部以“法典”命名的法律。', cat: '法律' },
  { t: '刑法规定：不满14周岁的人犯罪不负刑事责任；已满16周岁应负完全刑事责任。', cat: '法律' },
  { t: '光年是长度单位，1光年约9.46万亿千米；真空不能传声，光速约30万千米/秒。', cat: '科技' },
  { t: '纳米是长度单位，1纳米=10⁻⁹米。', cat: '科技' },
  { t: '中国天眼FAST位于贵州平塘，是世界上最大单口径射电望远镜。', cat: '科技' },
  { t: '北斗三号全球卫星导航系统2020年建成开通。', cat: '科技' },
  { t: '中国空间站“天宫”，核心舱“天和”；神舟飞船载人。', cat: '科技' },
  { t: '屠呦呦因发现青蒿素获2015年诺贝尔生理学或医学奖。', cat: '科技' },
  { t: '量子比特是量子计算的基本单位；5G是第五代移动通信技术。', cat: '科技' },
  { t: '第一部纪传体通史是《史记》（司马迁）；第一部编年体通史是《资治通鉴》（司马光）。', cat: '人文历史' },
  { t: '四大名著：《三国演义》《水浒传》《西游记》《红楼梦》。', cat: '人文历史' },
  { t: '科举制始于隋朝，1905年（清末）废除。', cat: '人文历史' },
  { t: '甲骨文是我国已发现的最早成熟文字，属商朝。', cat: '人文历史' },
  { t: '二十四节气起源于黄河流域，是指导农事的补充历法。', cat: '人文历史' },
  { t: '“岁寒三友”指松、竹、梅；“文房四宝”指笔墨纸砚。', cat: '人文历史' },
  { t: '四大发明：造纸术、印刷术、指南针、火药。', cat: '人文历史' },
  { t: '中国陆地面积约960万平方千米，居世界第三。', cat: '地理国情' },
  { t: '新疆是我国面积最大的省级行政区。', cat: '地理国情' },
  { t: '长江发源于青海格拉丹东，注入东海；黄河发源于青海巴颜喀拉山，注入渤海。', cat: '地理国情' },
  { t: '我国地势西高东低，呈三级阶梯分布。', cat: '地理国情' },
  { t: '北回归线穿过我国云南、广西、广东、台湾。', cat: '地理国情' },
  { t: '人民币发行权平时属于国务院下属的中国人民银行。', cat: '经济' },
  { t: 'GDP是国内生产总值；GNP是国民生产总值；基尼系数0.4为收入分配国际警戒线。', cat: '经济' },
  { t: '通货膨胀=流通中货币过多、物价持续上涨；恩格尔系数越低越富裕。', cat: '经济' },
  { t: '“看不见的手”指市场机制（亚当·斯密）；“看得见的手”指政府宏观调控。', cat: '经济' },
  { t: '人体最大的器官是皮肤，最长的骨是股骨。', cat: '生活常识' },
  { t: '绿茶不发酵、红茶全发酵、乌龙茶半发酵。', cat: '生活常识' },
  { t: '光的三原色是红绿蓝；颜料三原色是红黄蓝。', cat: '生活常识' },
  { t: '标准大气压下水的沸点为100℃，冰水混合为0℃。', cat: '生活常识' },
  { t: '我国四大民间传说：牛郎织女、孟姜女、白蛇传、梁山伯与祝英台。', cat: '人文历史' }
]
// ===== 时政池（含 date/region/类型）=====
const SHIZHENG = [
  { t: '“双碳”目标：2030年前实现碳达峰、2060年前实现碳中和。', date: '2025-09', region: '国内', cat: '政策经济' },
  { t: '共建“一带一路”已从“大写意”进入“工笔画”阶段。', date: '2025-09', region: '国内', cat: '理论会议' },
  { t: '国家数据局推动数据要素市场化配置改革。', date: '2025-10', region: '国内', cat: '政策经济' },
  { t: '低空经济：无人机配送、城市空中交通等新场景加速落地。', date: '2025-11', region: '国内', cat: '政策经济' },
  { t: '“人工智能+”行动：推动AI与制造、医疗、教育等深度融合。', date: '2025-12', region: '国内', cat: '政策经济' },
  { t: '首发经济、冰雪经济、银发经济成为消费新增长点。', date: '2026-01', region: '国内', cat: '政策经济' },
  { t: '2026年中央一号文件聚焦乡村全面振兴。', date: '2026-02', region: '国内', cat: '理论会议' },
  { t: '《民营经济促进法》2026年施行，依法保护民营企业产权和企业家权益。', date: '2026-03', region: '国内', cat: '政策经济' },
  { t: '我国粮食产量2025年再创新高，连续多年稳定在1.3万亿斤以上。', date: '2026-04', region: '国内', cat: '科技民生' },
  { t: '国产大飞机C919商业运营航线持续加密。', date: '2026-05', region: '国内', cat: '科技民生' },
  { t: '贵州“村超”“村BA”带动农文体旅融合出圈。', date: '2026-03', region: '贵州', cat: '贵州地方' },
  { t: '贵州大数据电子信息产业规模持续壮大，抢抓人工智能机遇。', date: '2026-04', region: '贵州', cat: '贵州地方' },
  { t: '贵州打造“世界级旅游目的地”，夏季避暑游火爆。', date: '2026-07', region: '贵州', cat: '贵州地方' },
  { t: '贵州交通：县县通高速，正加快建设“水陆空”立体交通网。', date: '2026-06', region: '贵州', cat: '贵州地方' },
  { t: '贵州深入实施“强省会”五年行动，贵阳贵安融合发展。', date: '2026-02', region: '贵州', cat: '贵州地方' },

  { t: '二十届三中全会：进一步全面深化改革、推进中国式现代化。', date: '2025-07', region: '国内', cat: '理论会议' },
  { t: '新发展理念：创新、协调、绿色、开放、共享。', date: '2025-10', region: '国内', cat: '理论会议' },
  { t: '中国式现代化是人口规模巨大的现代化等五个特征。', date: '2025-10', region: '国内', cat: '理论会议' },
  { t: '高质量发展是全面建设社会主义现代化国家的首要任务。', date: '2025-10', region: '国内', cat: '理论会议' },
  { t: '全过程人民民主是全链条、全方位、全覆盖的民主。', date: '2025-11', region: '国内', cat: '理论会议' },
  { t: '社会保障体系是人民生活的“安全网”、社会运行的“稳定器”。', date: '2025-11', region: '国内', cat: '理论会议' },
  { t: '新质生产力以创新为主导，要求形成新型生产关系。', date: '2025-11', region: '国内', cat: '理论会议' },
  { t: '中央经济工作会议部署“稳中求进、以进促稳”经济工作。', date: '2025-12', region: '国内', cat: '理论会议' },
  { t: '“十五五”规划开局之年为2026年；规划建议提出2035年远景目标。', date: '2026-01', region: '国内', cat: '理论会议' },
  { t: '2026年全国两会（人大、政协）3月在北京召开。', date: '2026-03', region: '国内', cat: '理论会议' },
  { t: '嫦娥六号实现人类首次月球背面采样返回（2024年）。', date: '2025-06', region: '国内', cat: '科技民生' },
  { t: '我国新能源汽车年产量2025年突破1000万辆，全球领先。', date: '2025-12', region: '国内', cat: '政策经济' },
  { t: '中欧班列累计开行突破10万列，联通亚欧。', date: '2026-07', region: '国内', cat: '政策经济' },
  { t: '2026年政府工作报告：GDP增长目标5%左右。', date: '2026-03', region: '国内', cat: '政策经济' },
  { t: '世界人工智能大会（WAIC）推动大模型应用落地。', date: '2026-07', region: '国内', cat: '科技民生' },
  { t: '我国建成全球最大5G网络、光纤网络。', date: '2026-06', region: '国内', cat: '科技民生' },
  { t: '贵州实施“新型工业化+新型城镇化”双轮强省战略。', date: '2025-10', region: '贵州', cat: '贵州地方' },
  { t: '贵阳做强“中国数谷”，建设国家大数据综合试验区。', date: '2025-11', region: '贵州', cat: '贵州地方' },
  { t: '贵州推进“四在农家·和美乡村”乡村振兴建设。', date: '2025-12', region: '贵州', cat: '贵州地方' },
  { t: '贵州围绕磷煤化工、新能源材料壮大特色优势工业。', date: '2026-01', region: '贵州', cat: '贵州地方' },
  { t: '贵安新区建成全球最大算力枢纽之一（数据中心集群）。', date: '2026-06', region: '贵州', cat: '贵州地方' },
  { t: '贵州安顺黄果树、铜仁梵净山等文旅持续升温。', date: '2026-05', region: '贵州', cat: '贵州地方' }
]
// ===== 高频成语库（逻辑填空常考，含释义/近反义/例句/来源/用法/频次）=====
const CHENGYU = [
  { t: '浅尝辄止', cat: '高频', yishi: '略微尝试一下就停下来，比喻不深入钻研。', jy: '蜻蜓点水/浮光掠影', fy: '锲而不舍/持之以恒', lj: '复习不能浅尝辄止，要反复回看。', ly: '常用成语', yf: '与“浮光掠影(印象不深)”“走马观花(观察不细)”常同现辨析。', p: '★★★★★', gm: '理论学习切忌浅尝辄止，要原原本本学深悟透。' },
  { t: '浮光掠影', cat: '高频', yishi: '水面的光和掠过的影子，比喻观察不细致、印象不深。', jy: '走马观花/蜻蜓点水', fy: '入木三分/鞭辟入里', lj: '读书若浮光掠影，等于没读。', ly: '清·李汝珍《镜花缘》', yf: '与“浅尝辄止(不深入做)”区分：浮光掠影侧重“看得不细”。', p: '★★★★★', gm: '调研不能浮光掠影，要深入基层听真话。' },
  { t: '走马观花', cat: '高频', yishi: '骑在跑着的马上看花，比喻粗略地观察事物。', jy: '浮光掠影', fy: '下马看花（深入）', lj: '参观学习不能走马观花，要带着问题看。', ly: '唐·孟郊《登科后》', yf: '常与“浅尝辄止”并列出现，都表“不深入”。', p: '★★★★☆', gm: '代表考察走马观花，难学到真经验。' },
  { t: '相得益彰', cat: '高频', yishi: '两者互相配合、映衬，更能显出各自的长处。', jy: '珠联璧合/相辅相成', fy: '相形见绌', lj: '文理结合，相得益彰。', ly: '《史记·伯夷列传》', yf: '褒义，多用于“配合得好”。', p: '★★★★★', gm: '传统技艺与现代设计相得益彰。' },
  { t: '珠联璧合', cat: '高频', yishi: '珍珠串在一起、美玉合在一起，比喻杰出的人才或美好的事物结合在一起。', jy: '相得益彰', fy: '分道扬镳', lj: '两位名师合作，珠联璧合。', ly: '《汉书·律历志》', yf: '强调“结合/联合”。', p: '★★★★☆', gm: '产学研珠联璧合，共促成果转化。' },
  { t: '应运而生', cat: '高频', yishi: '顺应时代潮流而产生。', jy: '应时而生/顺势而为', fy: '销声匿迹', lj: '短视频平台应运而生。', ly: '《礼记》', yf: '常考“新事物应运而生”。', p: '★★★★★', gm: '新业态应运而生，监管也要与时俱进。' },
  { t: '推陈出新', cat: '高频', yishi: '去掉旧事物的糟粕，取其精华，并使其向新的方向发展。', jy: '革故鼎新/除旧布新', fy: '因循守旧', lj: '传统文化要推陈出新。', ly: '清·戴延年《秋灯丛话》', yf: '强调“去旧创新”。', p: '★★★★★', gm: '文艺创作要在继承中推陈出新。' },
  { t: '革故鼎新', cat: '高频', yishi: '去掉旧的，建立新的。', jy: '推陈出新', fy: '抱残守缺', lj: '改革就是革故鼎新的过程。', ly: '《周易·杂卦》', yf: '书面语，力度强于“推陈出新”。', p: '★★★★☆', gm: '以革故鼎新的勇气深化改革。' },
  { t: '循序渐进', cat: '高频', yishi: '按一定的步骤逐渐深入或提高。', jy: '按部就班/由浅入深', fy: '一步登天/急于求成', lj: '学习要循序渐进，不能急于求成。', ly: '《论语·宪问》', yf: '强调“按顺序逐步”。', p: '★★★★★', gm: '课程改革要循序渐进，稳扎稳打。' },
  { t: '按部就班', cat: '高频', yishi: '按照一定的条理、步骤做事。', jy: '循序渐进', fy: '另辟蹊径', lj: '按部就班地推进各项工作。', ly: '晋·陆机《文赋》', yf: '中性词，与“循序渐进”近义。', p: '★★★★☆', gm: '项目按部就班推进，进度可控。' },
  { t: '独树一帜', cat: '高频', yishi: '单独树起一面旗帜，比喻自成一家。', jy: '标新立异/别具一格', fy: '亦步亦趋', lj: '他的教学风格独树一帜。', ly: '清·袁枚《随园诗话》', yf: '褒义，强调“自成一家”。', p: '★★★★☆', gm: '该品牌以国潮风格独树一帜。' },
  { t: '举足轻重', cat: '高频', yishi: '所处地位重要，一举一动都影响全局。', jy: '至关重要/举重若轻(异)', fy: '无足轻重', lj: '新能源产业在国民经济中举足轻重。', ly: '《后汉书·窦融传》', yf: '与“无足轻重”反义常考。', p: '★★★★★', gm: '粮食安全在国家战略中举足轻重。' },
  { t: '不可或缺', cat: '高频', yishi: '不能有一点点缺失，表示非常重要。', jy: '必不可少', fy: '可有可无', lj: '诚信是市场经济的不可或缺的基石。', ly: '常用成语', yf: '与“必不可少”近义。', p: '★★★★★', gm: '基层治理中，群众参与不可或缺。' },
  { t: '潜移默化', cat: '高频', yishi: '人的思想或性格在不知不觉中受到感染、影响而发生变化。', jy: '耳濡目染/润物无声', fy: '立竿见影', lj: '家风对人的影响潜移默化。', ly: '北齐·颜之推《颜氏家训》', yf: '强调“无形中受影响”，不能带宾语。', p: '★★★★★', gm: '优秀文化对青少年是潜移默化的熏陶。' },
  { t: '耳濡目染', cat: '高频', yishi: '耳朵经常听到、眼睛经常看到，不知不觉地受到影响。', jy: '潜移默化', fy: '不闻不问', lj: '他自幼耳濡目染，酷爱书法。', ly: '唐·韩愈《清河郡公房公墓碣铭》', yf: '与“潜移默化”近义，可换用。', p: '★★★★☆', gm: '科研氛围让年轻人在耳濡目染中成长。' },
  { t: '相形见绌', cat: '高频', yishi: '和同类事物相比较，显出不足。', jy: '黯然失色', fy: '鹤立鸡群', lj: '与专业团队相比，我们相形见绌。', ly: '清·吴趼人《二十年目睹之怪现状》', yf: '含“比不上”之意。', p: '★★★★☆', gm: '小厂产品与巨头相比相形见绌。' },
  { t: '高瞻远瞩', cat: '高频', yishi: '站得高、看得远，比喻眼光远大。', jy: '远见卓识/深谋远虑', fy: '鼠目寸光', lj: '国家战略需要高瞻远瞩。', ly: '清·黄宗羲', yf: '与“鼠目寸光”反义常考。', p: '★★★★☆', gm: '以高瞻远瞩的眼光谋划长远发展。' },
  { t: '提纲挈领', cat: '高频', yishi: '抓住纲绳、提起衣领，比喻抓住要领。', jy: '纲举目张/要言不烦', fy: '不得要领', lj: '复习先提纲挈领，把握主干。', ly: '《韩非子·外储说右下》', yf: '强调“抓住要点”。', p: '★★★★☆', gm: '讲话提纲挈领，重点突出。' },
  { t: '见微知著', cat: '高频', yishi: '见到事情的苗头，就能知道它的实质和发展趋势。', jy: '一叶知秋/以小见大', fy: '熟视无睹', lj: '从细节见微知著，是分析题的要点。', ly: '《周易》', yf: '强调“由小见大”。', p: '★★★★☆', gm: '从市场细微变化见微知著，提前布局。' },
  { t: '以偏概全', cat: '高频', yishi: '用片面的观点看待整体问题。', jy: '断章取义/一叶障目', fy: '顾全大局', lj: '不能因个例失败就以偏概全。', ly: '常用成语', yf: '贬义，逻辑填空常考“避免以偏概全”。', p: '★★★★☆', gm: '评价干部不能以偏概全，要看主流。' },
  { t: '断章取义', cat: '高频', yishi: '不顾全篇文章或谈话的内容，孤立地取其中的一段或一句的意思。', jy: '以偏概全', fy: '实事求是', lj: '引用要完整，不可断章取义。', ly: '《左传·襄公二十八年》', yf: '贬义，强调“截取片段曲解”。', p: '★★★★☆', gm: '媒体引用专家观点不应断章取义。' },
  { t: '无懈可击', cat: '高频', yishi: '没有一点弱点可以让人攻击，形容十分严密。', jy: '天衣无缝/滴水不漏', fy: '漏洞百出', lj: '这篇论证逻辑无懈可击。', ly: '《孙子兵法》', yf: '强调“严密无破绽”。', p: '★★★★☆', gm: '方案设计无懈可击，获全票通过。' },
  { t: '锲而不舍', cat: '高频', yishi: '雕刻一件东西一直刻下去不放手，比喻有恒心、有毅力。', jy: '持之以恒/坚持不懈', fy: '半途而废/一曝十寒', lj: '备考贵在锲而不舍。', ly: '《荀子·劝学》', yf: '与“持之以恒”近义，强调“坚持”。', p: '★★★★★', gm: '科研攻关需要锲而不舍的精神。' },
  { t: '持之以恒', cat: '高频', yishi: '长久地坚持下去。', jy: '锲而不舍/坚持不懈', fy: '半途而废', lj: '习惯的养成贵在持之以恒。', ly: '清·曾国藩', yf: '与“锲而不舍”近义。', p: '★★★★★', gm: '作风建设要持之以恒、久久为功。' },
  { t: '囫囵吞枣', cat: '高频', yishi: '把枣整个咽下去，比喻读书等不加分析地笼统接受。', jy: '生吞活剥/不求甚解', fy: '融会贯通/咀嚼消化', lj: '背书不能囫囵吞枣，要理解记忆。', ly: '宋·朱熹《答许顺之书》', yf: '与“融会贯通”反义。', p: '★★★★☆', gm: '学习理论切忌囫囵吞枣。' },
  { t: '融会贯通', cat: '高频', yishi: '把各方面的知识或道理融合贯穿起来，从而得到全面透彻的理解。', jy: '触类旁通/举一反三', fy: '囫囵吞枣', lj: '把各板块方法融会贯通，做题更快。', ly: '《朱子语类》', yf: '强调“融合理解”。', p: '★★★★★', gm: '把理论与实践融会贯通。' },
  { t: '举一反三', cat: '高频', yishi: '从一件事情类推而知道许多同类事情。', jy: '触类旁通/闻一知十', fy: '食古不化', lj: '学会一道题，举一反三。', ly: '《论语·述而》', yf: '强调“类推”。', p: '★★★★★', gm: '老师引导学生举一反三，触类旁通。' },
  { t: '因地制宜', cat: '高频', yishi: '根据各地的具体情况，制定适宜的办法。', jy: '因时制宜/因事制宜', fy: '生搬硬套', lj: '乡村振兴要因地制宜。', ly: '汉·赵晔《吴越春秋》', yf: '强调“按地区情况”。', p: '★★★★★', gm: '城市更新因地制宜，不搞一刀切。' },
  { t: '一蹴而就', cat: '高频', yishi: '踏一步就成功，比喻事情轻而易举，一下子就能成功。', jy: '一步登天(贬)', fy: '循序渐进/日积月累', lj: '能力提升不可能一蹴而就。', ly: '宋·苏洵《上田枢密书》', yf: '多用于否定句“不能一蹴而就”。', p: '★★★★★', gm: '全面小康不是一蹴而就的，是接续奋斗的结果。' },
  { t: '南辕北辙', cat: '高频', yishi: '心里想往南去却驾车往北走，比喻行动和目的相反。', jy: '背道而驰/缘木求鱼', fy: '殊途同归/异曲同工', lj: '方法不对，努力只会南辕北辙。', ly: '《战国策·魏策四》', yf: '与“背道而驰”近义，与“殊途同归”反义。', p: '★★★★★', gm: '脱离实际的改革只会南辕北辙。' },
  { t: '殊途同归', cat: '高频', yishi: '通过不同的途径，到达同一个目的地，比喻采取不同的方法得到相同的结果。', jy: '异曲同工', fy: '南辕北辙/分道扬镳', lj: '两种解法殊途同归。', ly: '《周易·系辞下》', yf: '与“异曲同工”近义。', p: '★★★★☆', gm: '各家说法虽异，但殊途同归。' },
  { t: '迫在眉睫', cat: '高频', yishi: '比喻事情临近眼前，十分紧迫。', jy: '刻不容缓/燃眉之急', fy: '远在天边', lj: '汛期将至，防汛工作迫在眉睫。', ly: '《列子·仲尼》', yf: '强调“时间紧迫”。', p: '★★★★☆', gm: '生态修复任务迫在眉睫。' },
  { t: '循规蹈矩', cat: '高频', yishi: '原指遵守规矩，现多指拘泥于旧的准则，不敢稍作变通。', jy: '墨守成规/按部就班', fy: '标新立异/独辟蹊径', lj: '做事不能一味循规蹈矩。', ly: '宋·朱熹《答方宾生书》', yf: '中性偏贬，与“墨守成规”近义。', p: '★★★★☆', gm: '发展不能循规蹈矩，要敢于创新。' },
  { t: '墨守成规', cat: '高频', yishi: '守着老规矩不肯改变，形容思想保守。', jy: '因循守旧/故步自封', fy: '推陈出新', lj: '产品迭代不能墨守成规。', ly: '明·黄宗羲', yf: '贬义，强调“守旧”。', p: '★★★★☆', gm: '改革要打破墨守成规的思维定式。' },
  { t: '本末倒置', cat: '高频', yishi: '把根本和枝节、主次颠倒了。', jy: '喧宾夺主/舍本逐末', fy: '主次分明', lj: '只重技巧不重基础是本末倒置。', ly: '金·无名氏《绥德州新学记》', yf: '与“舍本逐末”近义。', p: '★★★★★', gm: '不能本末倒置，忽视群众真实需求。' },
  { t: '喧宾夺主', cat: '高频', yishi: '比喻外来的或次要的事物占据了原有的、主要的事物的位置。', jy: '反客为主/本末倒置', fy: '主次分明', lj: '设计上动画不能喧宾夺主。', ly: '清·阮葵生《茶余客话》', yf: '强调“次要压过主要”。', p: '★★★★☆', gm: '形式主义让内容喧宾夺主。' },
  { t: '首当其冲', cat: '高频易错', yishi: '比喻最先受到攻击或遭遇灾难，不是“首先、第一个做某事”。', jy: '身先士卒(异)', fy: '独善其身', lj: '洪水中，堤坝首当其冲。', ly: '《汉书·五行志》', yf: '易错点：不能理解为“首先”。', p: '★★★★★', gm: '改革阵痛期，中小企业首当其冲。' },
  { t: '炙手可热', cat: '高频易错', yishi: '手一挨近就感到热，比喻气焰很盛、权势很大（多含贬义），不是“热门”。', jy: '权势熏天', fy: '平易近人', lj: '当年炙手可热的权臣终被清算。', ly: '唐·杜甫《丽人行》', yf: '易错点：不能用来形容“热门职业/专业”。', p: '★★★★★', gm: '该行业一度炙手可热，如今趋于理性。' },
  { t: '万人空巷', cat: '高频易错', yishi: '家家户户的人都从巷子里出来，形容庆祝、欢迎等盛况，不是“没人”。', jy: '门庭若市', fy: '门可罗雀', lj: '夺冠之夜，全城万人空巷。', ly: '宋·苏轼《八月十七日复登望海楼》', yf: '易错点：表示“人多”，非“冷清”。', p: '★★★★☆', gm: '元宵灯会万人空巷，热闹非凡。' },
  { t: '空穴来风', cat: '高频易错', yishi: '有了洞穴才有风进来，比喻消息和传说不是完全没有根据的。', jy: '事出有因', fy: '无稽之谈/捕风捉影', lj: '传言并非空穴来风，需核实。', ly: '战国·宋玉《风赋》', yf: '易错点：现多误用为“毫无根据”，考试常考原义。', p: '★★★★★', gm: '网传消息并非空穴来风，官方已回应。' },

  { t: '差强人意', cat: '高频易错', yishi: '大体上还能使人满意（"差"读 chā，轻微），不是"不能令人满意"。', jy: '大体满意', fy: '大失所望', lj: '这次的方案虽然不完美，但还算差强人意。', ly: '《后汉书·吴汉传》', yf: '多作褒义/中性，与"差强人意≠不满意"是常考陷阱；近5年逻辑填空高频。', p: '★★★★★', gm: '各部门整改虽有瑕疵，但总体差强人意，群众满意度稳步提升。' },
  { t: '不负众望', cat: '高频易错', yishi: '不辜负大家的期望，指成功、做得好。', jy: '不孚众望（反）', fy: '不孚众望', lj: '他果然不负众望，带队夺冠。', ly: '常用成语', yf: '"不负众望(成功)" vs "不孚众望(失信/失败)"是必考点。', p: '★★★★★', gm: '中国队不负众望，夺得该项目金牌。' },
  { t: '首当其冲', cat: '高频易错', yishi: '最先受到攻击或遭遇灾难，不是"首先"。', jy: '打头阵', fy: '退避三舍', lj: '灾区最先受冲击的就是首当其冲的村庄。', ly: '《汉书·五行志》', yf: '"首当其冲≠首先/带头"是经典陷阱。', p: '★★★★★', gm: '暴雨来袭，地势低洼的社区首当其冲。' },
  { t: '不刊之论', cat: '高频易错', yishi: '不可更改的正确言论（"刊"=删改），不是"不能刊登"。', jy: '不易之论', fy: '不经之谈', lj: '这篇文章堪称不刊之论。', ly: '《答李翊书》', yf: '"不刊之论"指言论正确，非不能发表。', p: '★★★★☆', gm: '该论断被学界奉为不刊之论。' },
  { t: '文不加点', cat: '高频易错', yishi: '文章一气呵成，无需修改（"点"=涂改），不是"不加标点"。', jy: '一气呵成', fy: '文思枯竭', lj: '他才思敏捷，下笔文不加点。', ly: '《鹦鹉赋序》', yf: '形容才思敏捷，非标点问题。', p: '★★★★☆', gm: '他即席发言文不加点，条理清晰。' },
  { t: '炙手可热', cat: '高频易错', yishi: '比喻气焰很盛、权势很大，常含贬义；不是"热门抢手"。', jy: '气焰熏天', fy: '门可罗雀', lj: '他当时炙手可热，人人避之。', ly: '《两京诗》', yf: '褒贬色彩是关键：不能用于"产品炙手可热(抢手)"。', p: '★★★★☆', gm: '当年他权倾一时、炙手可热，如今门庭冷落。' },
  { t: '明日黄花', cat: '高频易错', yishi: '过时的事物，不是"未来/明天"的事物。', jy: '昨日黄花', fy: '方兴未艾', lj: '这个话题已成明日黄花。', ly: '苏轼诗', yf: '指已过时，勿当"未来可期"。', p: '★★★★☆', gm: '这些旧经验已成明日黄花，必须与时俱进。' },
  { t: '万人空巷', cat: '高频易错', yishi: '家家户户的人都从巷子里出来，形容盛况空前，不是"巷子空无一人"。', jy: '盛况空前', fy: '门可罗雀', lj: '演唱会当晚万人空巷。', ly: '《水调歌头》', yf: '指人多而非人少。', p: '★★★★☆', gm: '航天员凯旋当天，全城万人空巷。' },
  { t: '望其项背', cat: '高频易错', yishi: '能够望见别人的颈项和背脊，表示赶得上（多用于否定：难以望其项背）。', jy: '望尘莫及（反义用法）', fy: '望尘莫及', lj: '他的水平令人难以望其项背。', ly: '常用成语', yf: '常与"难以/不能"连用；"望其项背≠望尘莫及"方向相反。', p: '★★★★★', gm: '其核心技术实力令同行难以望其项背。' },
  { t: '登堂入室', cat: '高频易错', yishi: '比喻学问或技能由浅入深，达到很高水平，不是"进入屋子"。', jy: '升堂入室', fy: '浅尝辄止', lj: '他钻研多年，终于登堂入室。', ly: '《论语》', yf: '形容水平高，非字面进屋。', p: '★★★☆☆', gm: '他深耕古籍数十载，终于登堂入室。' },
  { t: '举一反三', cat: '高频', yishi: '从一件事类推而知许多事，善于学习。', jy: '触类旁通', fy: '囫囵吞枣', lj: '学习要举一反三。', ly: '《论语》', yf: '逻辑填空常与"触类旁通"并列考查。', p: '★★★★★', gm: '要求各地举一反三、以点带面抓好整改。' },
  { t: '耳濡目染', cat: '高频', yishi: '经常听到看到，无形中受到影响。', jy: '潜移默化', fy: '充耳不闻', lj: '从小耳濡目染，他热爱书法。', ly: '《朱熹集注》', yf: '强调"听+看"的环境影响。', p: '★★★★★', gm: '青少年在良好家风的耳濡目染中成长。' },
  { t: '趋之若鹜', cat: '高频', yishi: '像鸭子一样成群跑过去，比喻许多人争着去（多含贬义）。', jy: '蜂拥而至', fy: '避之不及', lj: '大家对新风口趋之若鹜。', ly: '《明史》', yf: '贬义色彩，勿用于褒义。', p: '★★★★☆', gm: '一些人不辨真伪盲目跟风、趋之若鹜，值得警惕。' },
  { t: '叹为观止', cat: '高频', yishi: '赞叹所看到的事物好到了极点。', jy: '拍案叫绝', fy: '不屑一顾', lj: '这场表演令人叹为观止。', ly: '《左传》', yf: '褒义，用于赞美。', p: '★★★★☆', gm: '非遗展演技艺之精妙令人叹为观止。' },
  { t: '相得益彰', cat: '高频', yishi: '互相配合、补充，更能显出各自的长处。', jy: '相辅相成', fy: '相形见绌', lj: '两者结合相得益彰。', ly: '《史记》', yf: '强调"互相成就"。', p: '★★★★★', gm: '传统技艺与现代创意相得益彰。' },
  { t: '得不偿失', cat: '高频', yishi: '所得抵不上所失。', jy: '因小失大', fy: '一本万利', lj: '这样熬夜做题得不偿失。', ly: '常用成语', yf: '强调得失比较。', p: '★★★★☆', gm: '以牺牲环境换短期增长，得不偿失。' },
  { t: '水到渠成', cat: '高频', yishi: '水流到之处自然成渠，比喻条件成熟事情自然成功。', jy: '瓜熟蒂落', fy: '功亏一篑', lj: '基础打牢，成功自然水到渠成。', ly: '《答李翊书》', yf: '强调"水到"（条件）。', p: '★★★★★', gm: '基础打得牢，成果自然水到渠成。' },
  { t: '曲高和寡', cat: '高频', yishi: '言论或作品不通俗，能理解的人很少。', jy: '阳春白雪', fy: '雅俗共赏', lj: '这部学术著作曲高和寡。', ly: '宋玉《对楚王问》', yf: '含"高处不胜寒"之意。', p: '★★★☆☆', gm: '部分学术成果曲高和寡，需加强科普转化。' },
  { t: '饮鸩止渴', cat: '高频', yishi: '喝毒酒解渴，比喻用错误办法解决眼前困难而不顾后果。', jy: '杀鸡取卵', fy: '高瞻远瞩', lj: '靠刷题海战术提分是饮鸩止渴。', ly: '《后汉书》', yf: '强调"方法有害"。', p: '★★★★★', gm: '借新债还旧债无异于饮鸩止渴。' },
  { t: '未雨绸缪', cat: '高频', yishi: '趁着天没下雨先修缮房屋，比喻事先做好准备。', jy: '防患未然', fy: '临渴掘井', lj: '考前一个月就该未雨绸缪。', ly: '《诗经》', yf: '强调"提前准备"。', p: '★★★★★', gm: '防汛备汛未雨绸缪，全力守护群众安全。' },
]
// ===== 高频实词库（逻辑填空常考辨析）=====
const SHICI = [
  { t: '昭示', cat: '易混', yishi: '明白地表示或宣布。', jy: '揭示/宣告', fy: '掩盖', lj: '大会昭示了改革方向。', yf: '“昭示(明白宣示)” vs “暗示(含蓄示意)”。', p: '★★★★☆' },
  { t: '蕴含', cat: '高频', yishi: '包含、内含（多指抽象意义）。', jy: '蕴藏/包含', fy: '显露', lj: '故事蕴含深刻哲理。', yf: '常考“蕴含哲理/深意”。', p: '★★★★☆' },
  { t: '蕴藏', cat: '高频', yishi: '蓄积而未显露（多指资源）。', jy: '蕴含/埋藏', fy: '枯竭', lj: '地下蕴藏着丰富矿产。', yf: '“蕴含(抽象)” vs “蕴藏(资源)”。', p: '★★★★☆' },
  { t: '革新', cat: '高频', yishi: '革除旧的、创造新的。', jy: '变革/改良', fy: '守旧', lj: '技术革新推动产业升级。', yf: '“革新(根本改变)” vs “改良(局部改进)”。', p: '★★★★☆' },
  { t: '推诿', cat: '高频', yishi: '推卸责任、互相扯皮。', jy: '推脱/推卸', fy: '担当', lj: '遇事不能互相推诿。', yf: '“推诿(责任互相推)” vs “推脱(借故拒绝)”。', p: '★★★★☆' },
  { t: '质疑', cat: '高频', yishi: '提出疑问，要求解答。', jy: '质问/诘问', fy: '相信', lj: '专家对结论提出质疑。', yf: '“质疑(理性疑问)” vs “质问(严厉责问)”。', p: '★★★★☆' },
  { t: '承载', cat: '高频', yishi: '托着物体、承受其重量，比喻承担。', jy: '承担/承受', fy: '卸下', lj: '桥梁承载着两岸往来。', yf: '“承载(托物/抽象)” vs “承担(责任)”。', p: '★★★★☆' },
  { t: '甄别', cat: '高频', yishi: '审查辨别（真伪、优劣）。', jy: '鉴别/辨别', fy: '混淆', lj: '要对信息仔细甄别。', yf: '“甄别(审查真假)” vs “鉴别(区分好坏)”。', p: '★★★★☆' },
  { t: '约束', cat: '高频', yishi: '限制管束使不越出范围。', jy: '规范/规制', fy: '放任', lj: '法律约束着人们的行为。', yf: '“约束(行为)” vs “束缚(限制自由，贬)”。', p: '★★★★☆' },
  { t: '沿袭', cat: '高频', yishi: '依照旧传统或规定办理。', jy: '承袭/沿用', fy: '革新', lj: '这项制度沿袭至今。', yf: '“沿袭(中性)” vs “沿革(演变)”。', p: '★★★★☆' },
  { t: '演变', cat: '高频', yishi: '历时较久的发展变化。', jy: '演化/演进', fy: '停滞', lj: '文字经历了漫长的演变。', yf: '“演变(历时变化)” vs “变化(一般)”。', p: '★★★★☆' },
  { t: '统筹', cat: '高频', yishi: '统一筹划。', jy: '兼顾/协调', fy: '偏废', lj: '统筹城乡发展。', yf: '常考“统筹兼顾/统筹推进”。', p: '★★★★★' },
  { t: '兑现', cat: '高频', yishi: '实现诺言或票据换成现金。', jy: '落实/实现', fy: '失信', lj: '政策要兑现到户。', yf: '“兑现(承诺/资金)” vs “落实(措施)”。', p: '★★★★☆' },
  { t: '深化', cat: '高频', yishi: '向更深的程度发展。', jy: '强化/深入', fy: '弱化', lj: '深化改革开放。', yf: '常考“深化改革/深化认识”。', p: '★★★★★' },
  { t: '培育', cat: '高频', yishi: '培养幼小生物或养成好习惯。', jy: '孵化/扶持', fy: '扼杀', lj: '培育壮大新动能。', yf: '“培育(长期)” vs “催生(快速)”。', p: '★★★★☆' },
  { t: '谋划', cat: '高频', yishi: '筹划、想办法。', jy: '规划/筹谋', fy: '蛮干', lj: '提前谋划全年工作。', yf: '“谋划(动态思考)” vs “规划(静态方案)”。', p: '★★★★☆' },
  { t: '聚焦', cat: '高频', yishi: '比喻注意力集中于某点。', jy: '关注/集中', fy: '分散', lj: '聚焦主责主业。', yf: '常考“聚焦重点/聚焦问题”。', p: '★★★★★' },
  { t: '赋能', cat: '高频', yishi: '赋予能量、能力。', jy: '助力/加持', fy: '制约', lj: '数字技术为传统产业赋能。', yf: '新词，常考“科技赋能/数字赋能”。', p: '★★★★★' },
  { t: '落实', cat: '高频', yishi: '使计划、措施等得以实行。', jy: '落地/兑现', fy: '落空', lj: '把政策落实到位。', yf: '常考“落实落细/落地见效”。', p: '★★★★★' },
  { t: '攻坚', cat: '高频', yishi: '攻打坚固的堡垒，比喻解决难题。', jy: '克难/突破', fy: '退缩', lj: '集中力量攻坚核心技术。', yf: '常考“攻坚克难/脱贫攻坚”。', p: '★★★★☆' },
  { t: '笃行', cat: '高频', yishi: '忠实地践行。', jy: '践行/躬行', fy: '空谈', lj: '知行合一、笃行致远。', yf: '常考“笃行不怠/身体力行”。', p: '★★★★☆' },
  { t: '赓续', cat: '高频', yishi: '继续、延续。', jy: '延续/传承', fy: '中断', lj: '赓续红色血脉。', yf: '常考“赓续血脉/赓续文脉”。', p: '★★★★★' },

  { t: '遏制', cat: '易混', yishi: '制止、控制（多指力度强，强调"阻止"）。', jy: '遏制/遏止', fy: '放任', lj: '必须遏制房价过快上涨。', yf: '"遏制(控制)" vs "遏止(使停止)"：遏制后可继续存在，遏止是完全终止。', p: '★★★★★' },
  { t: '湮没', cat: '易混', yishi: '埋没、被历史遗忘。', jy: '埋没', fy: '显赫', lj: '他的贡献不应被湮没。', yf: '"湮没(抽象/名声)" vs "淹没(具体/水)"。', p: '★★★★☆' },
  { t: '蜚声', cat: '易混', yishi: '扬名、享有盛名（多指海内外）。', jy: '闻名', fy: '默默无闻', lj: '他蜚声海内外。', yf: '常考"蜚声国内外"固定搭配。', p: '★★★★☆' },
  { t: '勾勒', cat: '高频', yishi: '用线条画出轮廓，比喻大致描写。', jy: '描绘', fy: '全描', lj: '文章勾勒出时代画卷。', yf: '"勾勒(轮廓)" vs "描绘(细致)" 层次不同。', p: '★★★★☆' },
  { t: '厘清', cat: '高频', yishi: '整理清楚、辨析明白。', jy: '理清', fy: '混淆', lj: '先厘清概念再作答。', yf: '"厘清(辨析)" vs "理清(整理)"：厘清更强调界限。', p: '★★★★☆' },
  { t: '摒弃', cat: '高频', yishi: '舍弃、抛弃（多指抽象观念）。', jy: '抛弃', fy: '保留', lj: '摒弃陈旧观念。', yf: '"摒弃(思想)" vs "屏弃(具体物)"。', p: '★★★★☆' },
  { t: '秉持', cat: '高频', yishi: '执持、坚持（原则、理念）。', jy: '恪守', fy: '背弃', lj: '秉持初心。', yf: '常与"理念/原则/初心"搭配。', p: '★★★★☆' },
  { t: '彰显', cat: '高频', yishi: '鲜明地显示。', jy: '凸显', fy: '掩盖', lj: '彰显制度优势。', yf: '"彰显(正面/放大)" vs "凸显(突出)"。', p: '★★★★★' },
  { t: '孕育', cat: '高频', yishi: '怀胎生育，比喻酝酿新事物。', jy: '酝酿', fy: '扼杀', lj: '危机中孕育着机遇。', yf: '常考"孕育生机/希望"。', p: '★★★★☆' },
  { t: '滋养', cat: '高频', yishi: '供给养分、养育。', jy: '滋润', fy: '枯竭', lj: '中华文明滋养着人民。', yf: '"滋养(文化/精神)"搭配。', p: '★★★★☆' },
  { t: '衍生', cat: '高频', yishi: '演变产生。', jy: '衍生/派生', fy: '本源', lj: '由此衍生出系列问题。', yf: '强调"由母体产生"。', p: '★★★★☆' },
  { t: '沉淀', cat: '高频', yishi: '积累、沉淀（多指知识/文化）。', jy: '积淀', fy: '流失', lj: '千年的文化沉淀。', yf: '"沉淀(过程)" vs "积淀(结果)"。', p: '★★★★☆' },
  { t: '契合', cat: '高频', yishi: '符合、投合。', jy: '吻合', fy: '背离', lj: '方案与需求高度契合。', yf: '常考"契合度/相契合"。', p: '★★★★☆' },
  { t: '贯穿', cat: '高频', yishi: '从头到尾穿过、连通。', jy: '贯穿/贯穿始终', fy: '中断', lj: '这条主线贯穿全文。', yf: '常考"贯穿始终/主线"。', p: '★★★★☆' }
]
const myMem = computed(() => store.myMem)
const CATS = ['政治理论', '法律', '科技', '人文历史', '地理国情', '经济', '生活常识']
const SZCATS = ['理论会议', '政策经济', '科技民生', '贵州地方']

// ===== 状态 =====
const cat = ref('常识')
const cur = ref('')
const curRegion = ref('全部') // 时政地区筛选：全部/国内/贵州
const fCat = ref('全部') // 领域/类型筛选
const kw = ref('') // 搜索
const nowMonth = computed(() => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
})

// 时政按时间+地区过滤（时政时间范围 szFrom 起、szTo 止或今日）
function shizhengAvailable() {
  const from = store.cfg.szFrom || '2025-10',
    to = store.cfg.szTo || nowMonth.value
  return SHIZHENG.filter((x) => {
    const r = x.region
    const okR = curRegion.value === '全部' || r === curRegion.value
    const d = x.date || ''
    const okD = (!from || d >= from) && (!to || d <= to)
    return okR && okD
  })
}
function pool(c) {
  let list = []
  if (c === '时政') {
    const mine = myMem.value.filter((x) => x.type === '时政').map((x) => ({ t: x.text, date: '', region: '我的', cat: '我的' }))
    list = shizhengAvailable().concat(mine)
  } else if (c === '成语') {
    list = CHENGYU.concat(myMem.value.filter((x) => x.type === '成语').map((x) => ({ t: x.text, cat: '我的' })))
  } else if (c === '实词') {
    list = SHICI.concat(myMem.value.filter((x) => x.type === '实词').map((x) => ({ t: x.text, cat: '我的' })))
  } else {
    const mine = myMem.value.filter((x) => x.type === '常识').map((x) => ({ t: x.text, cat: '我的' }))
    list = CHANGSHI.concat(mine)
  }
  if (fCat.value && fCat.value !== '全部') list = list.filter((x) => x.cat === fCat.value)
  const k = kw.value.trim().toLowerCase()
  if (k) list = list.filter((x) => x.t.toLowerCase().includes(k))
  return list
}
const curDetail = computed(() => pool(cat.value).find((x) => x.t === cur.value) || null)
function pick(c) {
  const p = pool(c)
  if (!p.length) {
    cur.value = '（当前筛选下暂无条目，可调整筛选/搜索）'
    // 体验优化：本地库搜索无结果时，自动弹出联网查词（含 AI 知识卡 + 官网入口），
    // 不再需要用户手动再点一次"📡 联网查"
    const k = kw.value.trim()
    if (k && !lookupShow.value) {
      showToast('本地库暂无「' + k + '」，已自动为你联网查词', 'info')
      onlineLookup(k)
    }
    return
  }
  let arr = p
  if (reviewMode.value) {
    const due = p.filter((x) => {
      const s = srs.value[srsKey(x.t)]
      return !s || s.due <= todayKey()
    })
    if (due.length) arr = due
  }
  const o = arr[Math.floor(Math.random() * arr.length)]
  cur.value = o ? o.t : ''
}
function switchCat(c) {
  cat.value = c
  if (c !== '时政') curRegion.value = '全部'
  if (c !== '时政') fCat.value = '全部'
  pick(c)
}
function setRegion(r) {
  curRegion.value = r
  pick('时政')
}
function setCatFilter(v) {
  fCat.value = v
  pick(cat.value)
}
function searchPick() {
  pick(cat.value)
}
function next() {
  pick(cat.value)
}
function favorite() {
  if (!cur.value) return
  if (store.myMem.some((x) => x.text === cur.value)) {
    showToast('这条已在我的记忆库', 'info')
    return
  }
  store.myMem.push({ type: cat.value, text: cur.value, t: new Date().toLocaleString() })
  saveMyMem()
  showToast('✅ 已加入我的记忆库', 'success')
}

// ===== 常识 AI 出题交互 =====
const quiz = ref(null) // {q, opts:[], ans, type}
const picked = ref('') // 用户选的选项
const mark = ref(null) // true/false
const quizBusy = ref(false)
const seeExplain = ref('') // 解释/追问文本
const followQ = ref('')
function hasKey() {
  const c = activeCfg(false)
  return !!(c && c.key)
}
async function askQuiz(kind) {
  if (!hasKey()) {
    showToast('请先在设置配置 API Key', 'error')
    return
  }
  quizBusy.value = true
  quiz.value = null
  picked.value = ''
  mark.value = null
  seeExplain.value = ''
  const topic = cur.value || (cat.value === '常识' ? '常识知识点' : '时政时政知识点')
  let prompt
  if (kind === 'quiz')
    prompt =
      '你是行测常识判断命题专家。请基于下面这条知识点，出1道单选题（真题风格，难度中档）。命题要求：考点明确、题干无歧义、答案唯一；4个选项中3个干扰项各有明确错因（如绝对化/张冠李戴/时间陷阱/偷换概念/以偏概全/概念混淆），选项长度与信息量均衡、正确项位置随机、每个干扰项都要"似对实错"不能一眼排除。严格只输出 JSON，格式：{"问题":"题干","选项":["A. …","B. …","C. …","D. …"],"答案":0,"考点":"本题考点（含考频标注）"}\n知识点：' +
      topic.slice(0, 200)
  else
    prompt =
      '请为下面这条知识点写一段精炼的名师讲解（100-200字），解释生僻点、易错点、怎么记。\n知识点：' +
      topic.slice(0, 200)
  try {
    const c = activeCfg(false)
    const txt = await chatOnce(
      c,
      [
        { role: 'system', content: '你是资深公考老师，只输出用户要求的内容。' },
        { role: 'user', content: prompt }
      ],
      2000
    )
    if (kind === 'quiz') {
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) {
        throw new Error('AI返回格式异常')
      }
      const j = JSON.parse(m[0])
      quiz.value = { q: j.问题, opts: j.选项 || [], ans: j.答案, 考点: j.考点 || '常识' }
    } else seeExplain.value = txt || '（模型未生成内容，请重试）'
  } catch (e) {
    showToast('生成失败：' + e.message, 'error')
  } finally {
    quizBusy.value = false
  }
}
function choose(i) {
  if (!quiz.value) return
  picked.value = String.fromCharCode(65 + i)
  const right = i === quiz.value.ans
  mark.value = right
  // 答错 → 存错题集
  if (!right) {
    const q = '【常识出题自测】' + quiz.value.q + ' | 知识点源：' + (cur.value || '').slice(0, 60)
    store.wqs.unshift({
      id: Date.now(),
      subject: '常识判断',
      question: q,
      answer: String.fromCharCode(65 + quiz.value.ans),
      reasons: [right ? '' : '知识点遗忘'],
      time: new Date().toLocaleString()
    })
    saveWqs()
    showToast('❌ 已加入错题集（常识判断）', 'error')
  }
}
async function askFollow() {
  if (!followQ.value.trim()) return
  seeExplain.value = '（追问中…）'
  const t =
    '用户追问：' +
    followQ.value.trim() +
    ' 请结合该知识点精炼作答（100-200字）。\n知识点：' +
    (cur.value || '').slice(0, 150)
  try {
    const c = activeCfg(false)
    seeExplain.value =
      (await chatOnce(
        c,
        [
          { role: 'system', content: '你是考公名师，简明精准作答。' },
          { role: 'user', content: t }
        ],
        600
      )) || '（模型未生成内容，请重试）'
  } catch (e) {
    seeExplain.value = '追问失败：' + e.message
  }
}
// ===== 艾宾浩斯间隔重复（SRS）=====
const srs = ref({})
try {
  srs.value = JSON.parse(localStorage.getItem('xc_srs') || '{}') || {}
} catch (e) {}
const SRS_INT = [1, 2, 4, 7, 15, 30]
const todayKey = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function addDays(key, n) {
  const d = new Date(key)
  d.setDate(d.getDate() + n)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function srsKey(t) {
  return cat.value + '|' + t
}
const reviewMode = ref(false)
const dueList = computed(() => {
  const today = todayKey()
  return pool(cat.value).filter((t) => {
    const s = srs.value[srsKey(t)]
    return !s || s.due <= today
  })
})
const dueCount = computed(() => dueList.value.length)
function remember(ok) {
  const t = cur.value
  if (!t) return
  const k = srsKey(t)
  const s = srs.value[k] || { lvl: 0, due: todayKey() }
  if (ok) {
    s.lvl = Math.min(SRS_INT.length, (s.lvl || 0) + 1)
    // 第 lvl 次记住 → SRS_INT[lvl-1] 天后再复习（lvl=1 首次 = 1 天），与"1/2/4/7/15/30"对齐
    s.due = addDays(todayKey(), SRS_INT[Math.min(Math.max(0, s.lvl - 1), SRS_INT.length - 1)])
  } else {
    s.lvl = 0
    s.due = addDays(todayKey(), 1)
  }
  s.last = new Date().toLocaleString()
  srs.value[k] = s
  saveSrs()
  showToast(ok ? '✅ 记住了 · ' + s.due + ' 再复习' : '❌ 没记住 · 明天再复习', ok ? 'success' : 'error')
  next()
}
function saveSrs() {
  try {
    localStorage.setItem('xc_srs', JSON.stringify(srs.value))
  } catch (e) {}
}
// ===== 我的导入笔记（Obsidian/Markdown）=====
const noteView = ref(null)
function viewNote(n) {
  noteView.value = n
}
function closeNote() {
  noteView.value = null
}
function copyNote(n) {
  if (!n) return
  const md = '---\ntags: [' + (n.tags || []).join(', ') + ']\nsource: 行测AI问答助手\n---\n\n# ' + n.title + '\n\n' + String(n.body || '').trim()
  const done = () => showToast('已复制为 Obsidian 格式', 'success')
  const fail = () => showToast('复制失败', 'error')
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(md).then(done).catch(fail)
  } else {
    const ta = document.createElement('textarea')
    ta.value = md
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      done()
    } catch (e) {
      fail()
    }
    ta.remove()
  }
}
function delNote(i) {
  if (!confirm('删除这条导入笔记？')) return
  store.notes.splice(i, 1)
  saveNotes()
  if (noteView.value) noteView.value = null
}

const CY_CATS = ['高频易错', '高频']
const SC_CATS = ['易混', '高频']
const curCats = computed(() => {
  if (cat.value === '时政') return SZCATS
  if (cat.value === '成语') return CY_CATS
  if (cat.value === '实词') return SC_CATS
  return CATS
})
// 词条详情（成语/实词）
const detailShow = ref(false)
const detailItem = ref(null)
const aiDetail = ref('')
function openDetail() {
  const o = pool(cat.value).find((x) => x.t === cur.value)
  if (!o) return
  detailItem.value = o
  detailShow.value = true
  aiDetail.value = ''
}
async function aiExplainDetail() {
  if (!detailItem.value) return
  aiDetail.value = '（AI 生成中…）'
  const c = activeCfg(false)
  if (!c || !c.key) {
    aiDetail.value = '请先配置文字模型 API Key'
    return
  }
  try {
    const item = detailItem.value
    const prompt =
      '请为公考逻辑填空常考词「' + item.t + '」生成一份助记卡片：①一句话秒记 ②3个搭配/例句 ③常见陷阱或易混词辨析 ④出现语境（褒贬/正式/书面）。已知：释义 ' + (item.yishi || '') + '；近义 ' + (item.jy || '') + '；反义 ' + (item.fy || '') + '。150-250字。'
    aiDetail.value =
      (await chatOnce(
        c,
        [{ role: 'system', content: '你是公考言语理解老师。' }, { role: 'user', content: prompt }],
        900
      )) || '（无返回）'
  } catch (e) {
    aiDetail.value = '生成失败：' + e.message
  }
}
// ===== 我的记忆库管理（独立面板）=====
const memShow = ref(false)
const memKw = ref('')
const memFilter = ref('全部')
const memType = ref('常识')
const memText = ref('')
const memFiltered = computed(() => {
  let list = store.myMem.slice()
  if (memFilter.value !== '全部') list = list.filter((x) => x.type === memFilter.value)
  const k = memKw.value.trim().toLowerCase()
  if (k) list = list.filter((x) => String(x.text || '').toLowerCase().includes(k))
  return list
})
function memAdd() {
  const t = memText.value.trim()
  if (!t) { showToast('请输入内容', 'info'); return }
  store.myMem.unshift({ type: memType.value, text: t, t: new Date().toLocaleString() })
  saveMyMem()
  memText.value = ''
  showToast('✅ 已添加到记忆库', 'success')
}
function memDel(i) {
  const item = memFiltered.value[i]
  const ri = store.myMem.indexOf(item)
  if (ri >= 0) { store.myMem.splice(ri, 1); saveMyMem() }
}
function memClear() {
  if (!confirm('确定清空我的记忆库？')) return
  store.myMem = []
  saveMyMem()
  showToast('已清空记忆库', 'info')
}
// ===== 联网查任意知识点（4板块通用）+ AI 知识卡 =====
const queryTerm = ref('')
const aiCard = ref('')
const aiCardBusy = ref(false)
async function onlineQuery() {
  const t = queryTerm.value.trim()
  if (!t) {
    showToast('请输入要查询的常识/时政/成语/实词', 'info')
    return
  }
  await onlineLookup(t)
}
async function onlineLookup(term) {
  const t = String(term || '').trim()
  if (!t) return
  lookupTerm.value = t
  lookupShow.value = true
  aiCard.value = ''
  aiCardBusy.value = true
  openGmSearch(t)
  const c = activeCfg(false)
  if (!c || !c.key) {
    aiCard.value = '⚠️ 未配置文字模型 API Key，无法生成 AI 知识卡（联网结果仍可查看）'
    aiCardBusy.value = false
    return
  }
  try {
    const kind = cat.value
    let prompt
    if (kind === '成语')
      prompt = '请为成语「' + t + '」生成学习卡：①释义 ②近义/反义 ③例句 ④来源 ⑤逻辑填空用法/语境 ⑥一句话记忆点。100-200字。'
    else if (kind === '实词')
      prompt = '请为实词「' + t + '」生成学习卡：①释义 ②易混词辨析 ③搭配/例句 ④语境 ⑤一句话记忆点。100-200字。'
    else if (kind === '时政')
      prompt = '请为时政/政治理论知识点「' + t + '」生成学习卡：①核心内容 ②提出背景/场合 ③常考表述 ④一句话记忆点。100-200字，只讲确定事实。'
    else prompt = '请为常识知识点「' + t + '」生成学习卡：①核心内容 ②易错点 ③记忆口诀 ④可能考法。100-200字，只讲确定事实。'
    aiCard.value =
      (await chatOnce(
        c,
        [{ role: 'system', content: '你是严谨的公考讲师。' }, { role: 'user', content: prompt }],
        800
      )) || '（无返回）'
  } catch (e) {
    aiCard.value = 'AI 知识卡生成失败：' + e.message
  }
  aiCardBusy.value = false
}
function saveAiCard() {
  const t = lookupTerm.value
  if (!t) return
  const txt = aiCard.value ? '【AI学习卡】' + t + '\n' + aiCard.value : t
  if (store.myMem.some((x) => x.text === txt)) {
    showToast('已在记忆库中', 'info')
    return
  }
  store.myMem.unshift({ type: cat.value, text: txt, t: new Date().toLocaleString() })
  saveMyMem()
  showToast('✅ 已存入「我的记忆库」', 'success')
  lookupShow.value = false
  if (kw.value.trim() === t) pick(cat.value)
}
// ===== AI 批量扩库（每板块生成10条）=====
const genBusy = ref(false)
async function genBatch() {
  const c = activeCfg(false)
  if (!c || !c.key) {
    showToast('请先配置文字模型 API Key', 'error')
    return
  }
  genBusy.value = true
  try {
    const kind = cat.value
    let spec
    if (kind === '成语')
      spec = '给出10个国考高频成语（含易错），严格输出JSON数组：[{"word":"成语","yisi":"释义","jingyi":"近义","fanyi":"反义","liju":"例句"}]'
    else if (kind === '实词')
      spec = '给出10个国考高频实词辨析，严格输出JSON数组：[{"word":"实词","yisi":"释义","liju":"例句"}]'
    else if (kind === '时政')
      spec = '给出10条2025-2026年重要时政/政治理论要点，严格输出JSON数组：[{"word":"要点标题","yisi":"核心内容"}]'
    else spec = '给出10条公考常识（政治/法律/科技/人文/地理/经济/生活），严格输出JSON数组：[{"word":"常识点","yisi":"内容"}]'
    const reply = await chatOnce(
      c,
      [{ role: 'system', content: '你是公考知识库整理助手，严格输出JSON数组。' }, { role: 'user', content: spec }],
      2500
    )
    const m = String(reply || '').match(/\[[\s\S]*\]/)
    if (!m) throw new Error('AI返回格式异常')
    const arr = JSON.parse(m[0])
    let added = 0
    ;(arr || []).forEach((x) => {
      const w = String(x.word || '').trim()
      if (!w) return
      const full = w + '——' + (x.yisi || x.content || '') + (x.liju ? '（例：' + x.liju + '）' : '')
      if (store.myMem.some((mm) => mm.text === full)) return
      store.myMem.unshift({ type: kind, text: full, t: new Date().toLocaleString() })
      added++
    })
    saveMyMem()
    showToast('✅ 已生成并加入 ' + added + ' 条「' + kind + '」到记忆库', 'success')
    pick(cat.value)
  } catch (e) {
    showToast('生成失败：' + e.message, 'error')
  } finally {
    genBusy.value = false
  }
}
// 本地搜索无结果 → 联网查词 / 加入记忆库
const lookupShow = ref(false)
const lookupTerm = ref('')
function exportKb() { window.dispatchEvent(new CustomEvent('xc-export-kb')) }
function addToMem(term) {
  const t = String(term || '').trim()
  if (!t) return
  if (store.myMem.some((x) => x.text === t)) {
    showToast('已在记忆库中', 'info')
    return
  }
  store.myMem.unshift({ type: cat.value, text: t, t: new Date().toLocaleString() })
  saveMyMem()
  showToast('✅ 已加入「我的记忆库」，可继续复习', 'success')
  if (lookupShow.value) lookupShow.value = false
  if (kw.value.trim() === t) pick(cat.value)
}
// ===== 多源官网搜索（一键直达各官网搜索页）=====
const SEARCH_SOURCES = [
  { k: 'baike', n: '📖 百度百科', url: (t) => 'https://baike.baidu.com/search?word=' + encodeURIComponent(t) },
  { k: 'wiki', n: '🌐 维基百科', url: (t) => 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(t) },
  { k: 'people', n: '📰 人民网', url: (t) => 'https://search.people.cn/s?keyword=' + encodeURIComponent(t) },
  { k: 'xuexi', n: '🇨🇳 学习强国', url: (t) => 'https://www.xuexi.cn/search.html?keyword=' + encodeURIComponent(t) },
  { k: 'xinhua', n: '🏛️ 新华网', url: (t) => 'https://so.news.cn/#search/0/' + encodeURIComponent(t) + '/1/' },
  { k: 'bing', n: '🔎 必应', url: (t) => 'https://cn.bing.com/search?q=' + encodeURIComponent(t) }
]
// 联网查官媒用法（维基百科检索兜底 + DuckDuckGo + 官方入口直达）
const gmSearch = ref(null)
async function openGmSearch(term) {
  const people = 'https://search.people.cn/s?keyword=' + encodeURIComponent(term)
  const baike = 'https://baike.baidu.com/item/' + encodeURIComponent(term)
  gmSearch.value = { busy: true, items: [], term, people, baike }
  const items = []
  try {
    const res = await fetch(
      'https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
        encodeURIComponent('"' + term + '"') +
        '&format=json&origin=*&srlimit=5'
    )
    const j = await res.json()
    ;((j.query && j.query.search) || []).forEach((s) => {
      items.push({
        text: s.title + '：' + String(s.snippet || '').replace(/<[^>]+>/g, '').slice(0, 140),
        url: 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(s.title)
      })
    })
  } catch (e) {}
  if (items.length < 3) {
    try {
      const res = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent('"' + term + '" 人民日报') + '&format=json&no_html=1')
      const j = await res.json()
      if (j && j.AbstractText) items.push({ text: j.AbstractText, url: j.AbstractURL || '' })
      ;(j.RelatedTopics || []).forEach((t) => {
        if (t && t.Text) items.push({ text: t.Text, url: t.FirstURL || '' })
        else if (t && t.Topics) t.Topics.forEach((s) => s && s.Text && items.push({ text: s.Text, url: s.FirstURL || '' }))
      })
    } catch (e) {}
  }
  if (!items.length) items.push({ text: '（联网暂未直接检索到，可用下方入口在官方平台内搜索）', url: '' })
  gmSearch.value = { busy: false, items: items.slice(0, 6), term, people, baike }
}
// 联网核实（常识/时政）
const verifyShow = ref(false)
const verifyTab = ref('ai')
const verifyBusy = ref(false)
const verifyAi = ref('')
const verifyWeb = ref([])
async function openVerify() {
  const term = cur.value
  if (!term) return
  verifyShow.value = true
  verifyTab.value = 'ai'
  verifyAi.value = ''
  verifyWeb.value = []
  verifyBusy.value = true
  const webSnippets = []
  try {
    const res = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(term) + '&format=json&no_html=1&skip_disambig=1')
    const j = await res.json()
    if (j && j.AbstractText) webSnippets.push({ text: j.AbstractText, url: j.AbstractURL || '' })
    ;(j.RelatedTopics || []).forEach((t) => {
      if (t && t.Text) webSnippets.push({ text: t.Text, url: t.FirstURL || '' })
      else if (t && t.Topics) t.Topics.forEach((s) => s && s.Text && webSnippets.push({ text: s.Text, url: s.FirstURL || '' }))
    })
    if (!webSnippets.length) webSnippets.push({ text: '（未检索到相关网络结果，AI 将基于自身知识校验）', url: '' })
  } catch (e) {
    webSnippets.push({ text: '（联网失败：' + e.message + '，AI 将基于自身知识校验）', url: '' })
  }
  verifyWeb.value = webSnippets.slice(0, 5)
  const c = activeCfg(false)
  if (!c || !c.key) {
    verifyAi.value = '⚠️ 未配置文字模型 API Key，无法 AI 校验；可查看右侧「联网结果」。'
    verifyBusy.value = false
    return
  }
  try {
    const refText = webSnippets.map((s) => s.text).join('\n').slice(0, 1200)
    const prompt =
      '请校验下面这条公考常识/时政知识点的准确性，输出：\n【结论】准确 / 需修正 / 无法确认\n【修正后文本】准确规范版本\n【补充】1-2句要点（如有）\n\n待校验：\n' +
      term +
      '\n\n联网参考（可能为空）：\n' +
      refText
    verifyAi.value =
      (await chatOnce(
        c,
        [{ role: 'system', content: '你是严谨的公考知识校验助手，只讲确定的事实，不确定就说无法确认。' }, { role: 'user', content: prompt }],
        700
      )) || '（无返回）'
  } catch (e) {
    verifyAi.value = 'AI 校验失败：' + e.message
  }
  verifyBusy.value = false
}
function saveVerify() {
  const txt = (verifyTab.value === 'ai' ? verifyAi.value : verifyWeb.value.map((s) => s.text).join('\n')).trim()
  if (!txt) return
  store.myMem.unshift({ type: cat.value, text: '【联网核实】' + cur.value + '\n' + txt, t: new Date().toLocaleString() })
  saveMyMem()
  showToast('✅ 已收藏核实结果到我的记忆库', 'success')
}
// ===== 学习进度统计 =====
const accStats = computed(() => {
  const all = CHANGSHI.concat(SHIZHENG).concat(CHENGYU).concat(SHICI).concat(store.myMem.map((x) => ({ t: x.text })))
  const mastered = all.filter((x) => {
    const s = srs.value[(x.cat === undefined ? '常识' : '时政') + '|' + x.t]
    return s && s.lvl >= 2
  }).length
  const today = todayKey()
  const reviewedToday = Object.values(srs.value).filter((s) => s.last && s.last.slice && s.last.slice(0, 10) === today).length
  return { total: all.length, mastered, reviewedToday }
})
// ===== 常识速测（AI 一次出 5 题组卷）=====
const quizBatch = ref(null) // { qs, marks, cur, done }
const quizBusyB = ref(false)
async function startQuiz() {
  const c = activeCfg(false)
  if (!c || !c.key) {
    showToast('请先配置文字模型 API Key', 'error')
    return
  }
  quizBusyB.value = true
  try {
    const sys =
      '你是公考常识命题老师。请出5道常识/政治单选题，严格只输出JSON数组，不要多余文字：[{"stem":"题干","options":{"A":"..","B":"..","C":"..","D":".."},"answer":"B","analysis":"一句解析"}]'
    const reply = await chatOnce(
      c,
      [
        { role: 'system', content: sys },
        { role: 'user', content: '范围：政治理论、法律、科技、人文历史、地理、经济、时政常识。难度贴合国考常识。' }
      ],
      2500
    )
    const m = String(reply || '').match(/\[[\s\S]*\]/)
    if (!m) throw new Error('AI返回格式异常')
    const arr = JSON.parse(m[0])
    const qs = (arr || [])
      .slice(0, 5)
      .map((q) => {
        const opts = Object.keys(q.options || {}).map((k) => ({ k, t: q.options[k] })).slice(0, 4)
        return { stem: q.stem || '', options: opts, answer: String(q.answer || '').toUpperCase(), analysis: q.analysis || '' }
      })
      .filter((q) => q.stem && q.options.length >= 2)
    if (!qs.length) throw new Error('未解析到题目')
    quizBatch.value = { qs, marks: qs.map(() => null), cur: 0, done: false }
  } catch (e) {
    showToast('速测生成失败：' + e.message, 'error')
  } finally {
    quizBusyB.value = false
  }
}
function qbPick(k) {
  const b = quizBatch.value
  if (!b || b.marks[b.cur] != null) return
  b.marks[b.cur] = { ok: k === b.qs[b.cur].answer, pick: k }
}
function qbNext() {
  const b = quizBatch.value
  if (!b) return
  if (b.cur < b.qs.length - 1) b.cur++
  else b.done = true
}
function qbScore() {
  const b = quizBatch.value
  if (!b) return 0
  return b.qs.filter((q, i) => b.marks[i] && b.marks[i].ok).length
}
function qbSaveWrong() {
  const b = quizBatch.value
  if (!b) return
  const wrongs = b.qs.filter((q, i) => b.marks[i] && !b.marks[i].ok)
  wrongs.forEach((q) => {
    store.wqs.unshift({
      id: Date.now() + Math.random(),
      subject: '常识判断',
      question: q.stem + '\n\n' + q.options.map((o) => o.k + '. ' + o.t).join('\n'),
      answer: '正确答案 ' + q.answer,
      reasons: ['常识速测失误'],
      time: new Date().toLocaleString(),
      at: Date.now(),
      wrongCount: 1,
      correctStreak: 0,
      mastery: 0,
      digested: false
    })
  })
  saveWqs()
  showToast('✅ 已存错题 ' + wrongs.length + ' 题', 'success')
}
function onSearchTerm(e) {
  const d = (e && e.detail) || {}
  const type = String(d.type || '').trim()
  if (['常识', '时政', '成语', '实词'].includes(type)) cat.value = type
  if (d.term) { kw.value = String(d.term).trim(); pick(cat.value) }
}
onMounted(() => {
  pick('常识')
  window.addEventListener('xc-search-term', onSearchTerm)
})
</script>
<template>
  <div class="page on acc-page">
    <div class="page-inner">
      <div class="acc-head">
        <span class="acc-title">🗂️ 常识 · 时政积累</span>
        <span v-if="cat === '常识'" class="acc-sub">每天记一条常识 · 错了自动入库</span>
        <span v-if="dueCount" class="acc-due">🔁 今日待复习 {{ dueCount }}</span>
        <div class="acc-stats">📊 已掌握 <b>{{ accStats.mastered }}</b> / {{ accStats.total }} 条 · 今日复习 {{ accStats.reviewedToday }} 次</div>
        <button class="fp-b gold" style="margin-top: 6px" @click="memShow = true">📦 我的记忆库（{{ store.myMem.length }}）</button>
        <span v-if="!dueCount" class="acc-sub">时政/政治理论积累 · 按地区筛选</span>
      </div>
    <div class="fp-query">
      <input v-model="queryTerm" placeholder="输入任意 常识/时政/成语/实词，联网查 + AI 整理…" @keydown.enter="onlineQuery()" />
      <button class="fp-b quiz" :disabled="aiCardBusy" @click="onlineQuery()">{{ aiCardBusy ? '查询中…' : '📡 联网查' }}</button>
    </div>
    <div class="fp-gen"><button class="fp-b quiz" :disabled="genBusy" @click="genBatch()">{{ genBusy ? '生成中…' : '🤖 生成 10 条扩库' }}</button><span class="fp-gen-tip">AI 批量生成该板块新知识点加入记忆库</span></div>
    <div class="fp-gen"><button class="fp-b gold" @click="exportKb()">📤 导出积累</button><span class="fp-gen-tip">导出我的记忆库（Word/PDF/Markdown）</span></div>
    <div class="fp-cat">
      <button class="fp-c" :class="{ on: cat === '常识' }" @click="switchCat('常识')">常识</button>
      <button class="fp-c" :class="{ on: cat === '时政' }" @click="switchCat('时政')">时政·政治</button>
      <button class="fp-c" :class="{ on: cat === '成语' }" @click="switchCat('成语')">成语</button>
      <button class="fp-c" :class="{ on: cat === '实词' }" @click="switchCat('实词')">实词</button>
    </div>
    <!-- 时政地区筛选 -->
    <!-- 搜索 + 领域/类型筛选 -->
    <div class="fp-search">
      <input v-model="kw" placeholder="🔍 搜索常识/时政关键词…（回车/搜索按钮 随机抽一条匹配）" @keydown.enter="searchPick()" />
      <button class="fp-b" @click="searchPick()">搜索</button>
    </div>
    <div class="fp-reg cats">
      <button class="fp-c s" :class="{ on: fCat === '全部' }" @click="setCatFilter('全部')">全部</button>
      <button v-for="ct in curCats" :key="ct" class="fp-c s" :class="{ on: fCat === ct }" @click="setCatFilter(ct)">{{ ct }}</button>
    </div>
    <div v-if="cat === '时政'" class="fp-reg">
      <button class="fp-c s" :class="{ on: curRegion === '全部' }" @click="setRegion('全部')">全部</button>
      <button class="fp-c s" :class="{ on: curRegion === '国内' }" @click="setRegion('国内')">国内</button>
      <button class="fp-c s" :class="{ on: curRegion === '贵州' }" @click="setRegion('贵州')">贵州·地方</button>
    </div>
    <!-- 正文 -->
    <template v-if="!quiz && !quizBatch">
      <div class="fp-body">{{ cur }}</div>
      <div v-if="(cat === '成语' || cat === '实词') && curDetail" class="fp-body sub">{{ curDetail.yishi }}</div>
      <div class="fp-foot">
        <button v-if="cat === '成语' || cat === '实词'" class="fp-b quiz" @click="openDetail()">📖 详解/辨析</button>
        <button v-if="cat === '常识' || cat === '时政'" class="fp-b quiz" @click="openVerify()">🔍 联网核实</button>
      </div>
      <div class="fp-foot">
        <button class="fp-b" :class="{ on: reviewMode }" @click="reviewMode = !reviewMode; next()">🔁 复习{{ reviewMode ? '中' : '' }}<span v-if="dueCount"> {{ dueCount }}</span></button>
        <button class="fp-b" @click="next()">🎲 换一条</button>
        <button class="fp-b gold" @click="favorite()">⭐ 收藏</button>
      </div>
      <div class="fp-foot srs-foot">
        <button class="fp-b ok" @click="remember(true)">✅ 记住了</button>
        <button class="fp-b no" @click="remember(false)">❌ 没记住</button>
        <span class="fp-srs-tip">艾宾浩斯：1/2/4/7/15/30 天后复习</span>
      </div>
      <div v-if="cat === '常识'" class="fp-foot">
        <button class="fp-b quiz" :disabled="quizBusyB" @click="startQuiz()">{{ quizBusyB ? '生成中…' : '📝 常识速测' }}</button>
        <button class="fp-b quiz" :disabled="quizBusy" @click="askQuiz('quiz')">
          {{ quizBusy ? '出题中…' : '✏️ 出题考我' }}
        </button>
        <button class="fp-b gold" :disabled="quizBusy" @click="askQuiz('explain')">📖 名师详解</button>
      </div>
</template>
    <!-- 答题面板 -->
    <div v-else-if="quiz" class="fp-quiz">
      <div class="q-hd">
        ❓ {{ quiz.q }}
        <span v-if="quiz.考点" class="q-kd">考点：{{ quiz.考点 }}</span>
      </div>
      <div class="q-opts">
        <button
          v-for="(o, i) in quiz.opts"
          :key="i"
          class="q-o"
          :class="{
            on: picked === String.fromCharCode(65 + i),
            right: mark != null && i === quiz.ans && picked === String.fromCharCode(65 + i),
            wrong: mark != null && picked === String.fromCharCode(65 + i) && i !== quiz.ans
          }"
          @click="choose(i)"
        >
          {{ o }}
        </button>
      </div>
      <div v-if="mark != null" class="q-mark" :class="mark ? 'ok' : 'no'">
        {{ mark ? '✅ 回答正确' : '❌ 回答错误（已存入错题集）' }}
      </div>
      <div class="fp-foot">
        <button
          class="fp-b"
          @click="quiz = null; mark = null; picked = ''"
        >
          关闭
        </button>
        <button
          class="fp-b"
          @click="seeExplain = ''; askQuiz('explain')"
        >
          📖 看讲解
        </button>
      </div>
    </div>
    <!-- 常识速测 -->
    <div v-if="quizBatch && !quizBatch.done" class="fp-batch">
      <div class="q-hd">❓ {{ quizBatch.cur + 1 }}/{{ quizBatch.qs.length }} · {{ quizBatch.qs[quizBatch.cur].stem }}</div>
      <div class="q-opts">
        <button
          v-for="o in quizBatch.qs[quizBatch.cur].options"
          :key="o.k"
          class="q-o"
          :class="{
            on: quizBatch.marks[quizBatch.cur] && quizBatch.marks[quizBatch.cur].pick === o.k,
            right: quizBatch.marks[quizBatch.cur] && o.k === quizBatch.qs[quizBatch.cur].answer,
            wrong: quizBatch.marks[quizBatch.cur] && quizBatch.marks[quizBatch.cur].pick === o.k && o.k !== quizBatch.qs[quizBatch.cur].answer
          }"
          :disabled="quizBatch.marks[quizBatch.cur] != null"
          @click="qbPick(o.k)"
        >{{ o.k }}. {{ o.t }}</button>
      </div>
      <div v-if="quizBatch.marks[quizBatch.cur]" class="q-mark" :class="quizBatch.marks[quizBatch.cur].ok ? 'ok' : 'no'">
        {{ quizBatch.marks[quizBatch.cur].ok ? '✅ 正确' : '❌ 错误，答案 ' + quizBatch.qs[quizBatch.cur].answer }}
        <span v-if="quizBatch.qs[quizBatch.cur].analysis" class="qb-an">· {{ quizBatch.qs[quizBatch.cur].analysis }}</span>
      </div>
      <div class="fp-foot">
        <button class="fp-b" @click="quizBatch = null">退出</button>
        <button v-if="quizBatch.marks[quizBatch.cur]" class="fp-b" @click="qbNext()">
          {{ quizBatch.cur + 1 >= quizBatch.qs.length ? '交卷 📄' : '下一题 ▶' }}
        </button>
      </div>
    </div>
    <div v-if="quizBatch && quizBatch.done" class="fp-batch done">
      <div class="q-hd">📄 常识速测成绩</div>
      <div class="qb-score">{{ qbScore() }} / {{ quizBatch.qs.length }}</div>
      <div class="qb-rate">{{ Math.round((qbScore() / quizBatch.qs.length) * 100) }}%</div>
      <div class="pnl-btns">
        <button class="btn btn-gh" @click="qbSaveWrong()">📌 错题入库</button>
        <button class="btn btn-gh" @click="quizBatch = null">再来一组</button>
        <button class="btn btn-pri" @click="quizBatch = null">完成</button>
      </div>
    </div>
    <!-- 词条详解（成语/实词） -->
    <div v-if="detailShow && detailItem" class="ov show" @click.self="detailShow = false">
      <div class="pnl idiom-pnl">
        <h3>📖 {{ detailItem.t }} <span class="id-tag">{{ detailItem.cat }}</span></h3>
        <div class="id-row"><b>释义</b><span>{{ detailItem.yishi || '—' }}</span></div>
        <div class="id-row"><b>近义</b><span>{{ detailItem.jy || '—' }}</span></div>
        <div class="id-row"><b>反义</b><span>{{ detailItem.fy || '—' }}</span></div>
        <div class="id-row"><b>例句</b><span>{{ detailItem.lj || '—' }}</span></div>
        <div v-if="detailItem.ly" class="id-row"><b>来源</b><span>{{ detailItem.ly }}</span></div>
        <div v-if="detailItem.yf" class="id-row"><b>逻辑填空用法</b><span>{{ detailItem.yf }}</span></div>
        <div v-if="detailItem.p" class="id-row"><b>真题频次</b><span>{{ detailItem.p }}</span></div>
        <div v-if="detailItem.gm" class="id-row gm"><b>官媒例句</b><span>{{ detailItem.gm }}</span></div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="detailShow = false">关闭</button>
          <button class="btn btn-gh" @click="openGmSearch(detailItem.t)">🔍 查官媒用法</button>
          <button class="btn btn-pri" :disabled="aiDetail === '（AI 生成中…）'" @click="aiExplainDetail()">🤖 AI 助记详解</button>
        </div>
        <div v-if="aiDetail" class="id-ai">{{ aiDetail }}</div>
        <div v-if="gmSearch && gmSearch.busy" class="sim-loading"><span class="spin"></span> 正在检索官媒用法…</div>
        <div v-else-if="gmSearch && !gmSearch.busy" class="gm-res">
          <div class="gm-title">📰 「{{ gmSearch.term }}」官媒检索结果</div>
          <div class="gm-go">
            <a :href="gmSearch.people" target="_blank" rel="noopener" class="gm-go-btn">📰 人民网搜「{{ gmSearch.term }}」</a>
            <a :href="gmSearch.baike" target="_blank" rel="noopener" class="gm-go-btn">📖 百度百科查词</a>
            <span class="gm-go-tip">学习强国主要在 App 内搜索</span>
          <div class="gm-sec">🌐 多源官网搜索（点击直达官方搜索页）</div>
          <div class="gm-sources">
            <a v-for="s in SEARCH_SOURCES" :key="s.k" :href="s.url(lookupTerm)" target="_blank" rel="noopener" class="gm-go-btn src">{{ s.n }}</a>
          </div>
          </div>
          <div v-for="(s, i) in gmSearch.items" :key="i" class="vw-item">
            <div class="vw-t">{{ s.text }}</div>
            <a v-if="s.url" :href="s.url" target="_blank" rel="noopener" class="vw-u">来源 ↗</a>
          </div>
        </div>
      </div>
    </div>
    <!-- 联网核实（常识/时政） -->
    <div v-if="verifyShow" class="ov show" @click.self="verifyShow = false">
      <div class="pnl verify-pnl">
        <h3>🔍 联网核实 · {{ cur }}</h3>
        <div class="fp-reg cats">
          <button class="fp-c s" :class="{ on: verifyTab === 'ai' }" @click="verifyTab = 'ai'">🤖 AI 校验</button>
          <button class="fp-c s" :class="{ on: verifyTab === 'web' }" @click="verifyTab = 'web'">🌐 联网结果</button>
        </div>
        <div v-if="verifyBusy" class="sim-loading"><span class="spin"></span> 正在联网搜索并 AI 校验…</div>
        <template v-else>
          <div v-if="verifyTab === 'ai'" class="verify-ai">{{ verifyAi || '（暂无）' }}</div>
          <div v-else class="verify-web">
            <div v-for="(s, i) in verifyWeb" :key="i" class="vw-item">
              <div class="vw-t">{{ s.text }}</div>
              <a v-if="s.url" :href="s.url" target="_blank" rel="noopener" class="vw-u">来源 ↗</a>
            </div>
          </div>
          <div class="pnl-btns">
            <button class="btn btn-gh" @click="verifyShow = false">关闭</button>
            <button class="btn btn-pri" @click="saveVerify()">📌 收藏核实结果</button>
          </div>
        </template>
      </div>
    </div>
    <!-- 本地无结果 → 联网查词 -->
    <div v-if="kw.trim() && !pool(cat).length" class="fp-nohit">
      <div class="fp-nohit-t">本地库暂无「{{ kw }}」</div>
      <div class="fp-nohit-s">可联网查词（释义/官媒用法/百科）或加入本地记忆库</div>
      <div class="fp-nohit-acts">
        <button class="fp-b quiz" @click="onlineLookup(kw)">📡 联网查词</button>
        <button class="fp-b" @click="addToMem(kw)">➕ 加入记忆库</button>
      </div>
    </div>
    <!-- 联网查词弹窗 -->
    <div v-if="lookupShow" class="ov show" @click.self="lookupShow = false">
      <div class="pnl idiom-pnl">
        <h3>📡 联网查「{{ lookupTerm }}」</h3>
        <div v-if="gmSearch && gmSearch.busy" class="sim-loading"><span class="spin"></span> 正在检索…</div>
        <template v-else-if="gmSearch">
          <div v-for="(s, i) in gmSearch.items" :key="i" class="vw-item">
            <div class="vw-t">{{ s.text }}</div>
            <a v-if="s.url" :href="s.url" target="_blank" rel="noopener" class="vw-u">来源 ↗</a>
          </div>
          <div class="gm-go">
            <a :href="gmSearch.people" target="_blank" rel="noopener" class="gm-go-btn">📰 人民网搜「{{ lookupTerm }}」</a>
            <a :href="gmSearch.baike" target="_blank" rel="noopener" class="gm-go-btn">📖 百度百科查词</a>
          </div>
          <div class="gm-sec">🌐 多源官网搜索（点击直达官方搜索页）</div>
          <div class="gm-sources">
            <a v-for="s in SEARCH_SOURCES" :key="s.k" :href="s.url(lookupTerm)" target="_blank" rel="noopener" class="gm-go-btn src">{{ s.n }}</a>
          </div>
          <div class="pnl-btns">
            <button class="btn btn-gh" @click="lookupShow = false">关闭</button>
            <button class="btn btn-pri" @click="saveAiCard()">➕ 加入记忆库</button>
          <div v-if="aiCardBusy" class="sim-loading"><span class="spin"></span> 🤖 AI 正在整理知识卡…</div>
          <div v-else-if="aiCard" class="id-ai"><b>🤖 AI 学习卡</b><br />{{ aiCard }}</div>
          </div>
        </template>
      </div>
    </div>
    <!-- 我的记忆库管理面板 -->
    <div v-if="memShow" class="ov show" @click.self="memShow = false">
      <div class="pnl mem-pnl">
        <h3>📦 我的记忆库（{{ store.myMem.length }} 条）</h3>
        <div class="fp-search">
          <input v-model="memKw" placeholder="🔍 搜索记忆库…" />
        </div>
        <div class="fp-reg cats">
          <button v-for="f in ['全部', '常识', '时政', '成语', '实词']" :key="f" class="fp-c s" :class="{ on: memFilter === f }" @click="memFilter = f">{{ f }}</button>
        </div>
        <div class="mem-add">
          <select v-model="memType" style="flex: 0 0 74px"><option>常识</option><option>时政</option><option>成语</option><option>实词</option></select>
          <input v-model="memText" placeholder="新增一条积累…" @keydown.enter="memAdd()" />
          <button class="fp-b" @click="memAdd()">➕ 添加</button>
        </div>
        <div class="mem-list">
          <div v-for="(x, i) in memFiltered" :key="i" class="mem-it">
            <span class="mem-tag">{{ x.type }}</span>
            <span class="mem-txt">{{ x.text }}</span>
            <button class="mem-del" @click="memDel(i)">✕</button>
          </div>
          <div v-if="!memFiltered.length" class="acc-notes-empty">暂无条目，可联网查词/生成10条扩库/手动添加</div>
        </div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="memClear()">🗑 清空</button>
          <button class="btn btn-gh" @click="exportKb()">📤 导出</button>
          <button class="btn btn-pri" @click="memShow = false">完成</button>
        </div>
      </div>
    </div>
    <!-- 讲解/追问 -->
    <div v-if="seeExplain" class="fp-body exp">{{ seeExplain }}</div>
    <div v-if="seeExplain && !quiz" class="fp-follow">
      <input v-model="followQ" placeholder="追问：如 这题为啥选A？" @keydown.enter="askFollow()" />
      <button class="fp-b" @click="askFollow()">追问</button>
    </div>
    </div>
    </div>
    <!-- 我的导入笔记（Obsidian/Markdown） -->
    <div class="acc-notes">
      <div class="sec-t">
        📝 我的导入笔记
        <span style="font-size: 11px; color: var(--text3)">（Obsidian/Markdown）</span>
      </div>
      <div v-if="!store.notes.length" class="acc-notes-empty">
        还没有导入笔记，去 ⚙️设置 → 数据管理 → 📥 导入笔记(.md)
      </div>
      <div v-for="(n, i) in store.notes" :key="i" class="note-item">
        <div class="note-hd">
          <span class="note-t">{{ n.title }}</span>
          <span class="note-tags"><span v-for="t in (n.tags || [])" :key="t">#{{ t }}</span></span>
        </div>
        <div class="note-prev">{{ String(n.body || '').replace(/\n+/g, ' ').slice(0, 140) }}</div>
        <div class="note-acts">
          <button class="fp-b" @click="viewNote(n)">👁 查看</button>
          <button class="fp-b" @click="copyNote(n)">📋 复制 Obsidian</button>
          <button class="fp-b" @click="delNote(i)">🗑 删除</button>
        </div>
      </div>
    </div>
    <!-- 笔记查看弹窗 -->
    <div v-if="noteView" class="ov show" @click.self="closeNote()">
      <div class="pnl note-pnl">
        <h3>📝 {{ noteView.title }}</h3>
        <div class="note-tags"><span v-for="t in (noteView.tags || [])" :key="t">#{{ t }}</span></div>
        <pre class="note-body">{{ noteView.body }}</pre>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="closeNote()">关闭</button>
          <button class="btn btn-gh" @click="copyNote(noteView)">📋 复制 Obsidian</button>
        </div>
      </div>
    </div>

</template>
<style scoped>
.acc-page {
  padding: 10px 12px;
}
.acc-head {
  margin-bottom: 10px;
}
.acc-title {
  font-size: 15px;
  font-weight: 800;
  background: var(--grad-primary);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.35));
}
.acc-sub {
  display: block;
  font-size: 11px;
  color: var(--text3);
  margin-top: 2px;
}
.fp-head {
  display: none;
}
.fp-btn, .fp-dot, .fp-ops, .fp-o {
  display: none;
}
.fp-card {
  width: 100%;
  margin: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  opacity: 1;
}
.fp-o {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text2);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}
.fp-o:hover {
  background: var(--accent2);
  color: var(--accent);
}
.fp-cat {
  display: flex;
  gap: 4px;
  padding: 8px 10px 2px;
}
.fp-reg {
  display: flex;
  gap: 4px;
  padding: 4px 10px 2px;
}
.fp-c {
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: var(--text2);
  font-size: 11px;
  cursor: pointer;
}
.fp-c.s {
  padding: 2px 8px;
  font-size: 10.5px;
}
.fp-c.on {
  background: var(--accent2);
  color: var(--accent);
  border-color: rgba(56, 189, 248, 0.3);
}
.fp-body {
  padding: 12px 12px 8px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text);
  min-height: 64px;
}
.fp-body.exp {
  border-top: 1px dashed rgba(255, 255, 255, 0.14);
  color: var(--text2);
  font-size: 12px;
  min-height: 0;
}
.fp-card.sm .fp-body {
  font-size: 12px;
}
.fp-foot {
  display: flex;
  gap: 6px;
  padding: 2px 10px 10px;
}
.fp-b {
  flex: 1;
  padding: 6px 0;
  border: none;
  border-radius: 12px;
  background: var(--accent2);
  color: var(--accent);
  font-size: 11.5px;
  cursor: pointer;
  font-family: inherit;
}
.fp-b.gold {
  background: rgba(251, 191, 36, 0.12);
  color: var(--amber);
}
.fp-b.quiz {
  background: #2f6fb3;
  color: #fff;
}
.fp-b:disabled {
  opacity: 0.5;
}
.fp-b:hover {
  filter: brightness(1.12);
}
/* 答题面板 */
.fp-quiz {
  padding: 10px;
}
.q-hd {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text);
  margin-bottom: 8px;
}
.q-kd {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  color: var(--accent);
}
.q-opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.q-o {
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.q-o:hover {
  border-color: var(--accent);
}
.q-o.on {
  border-color: var(--accent);
  background: var(--accent2);
}
.q-o.right {
  background: rgba(52, 211, 153, 0.16);
  border-color: var(--green);
  color: var(--green);
}
.q-o.wrong {
  background: rgba(248, 113, 113, 0.16);
  border-color: var(--red);
  color: var(--red);
}
.q-mark {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 700;
}
.q-mark.ok {
  color: var(--green);
}
.q-mark.no {
  color: var(--red);
}
.fp-follow {
  display: flex;
  gap: 6px;
  padding: 0 10px 10px;
}
.fp-follow input {
  flex: 1;
  padding: 6px 9px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--surface);
  color: var(--text);
  font-size: 11.5px;
  font-family: inherit;
  outline: none;
}
</style>
