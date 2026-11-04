/* 题库补充：真题 + 模拟题（手工维护）
   ------------------------------------------------------------------
   sunfleeting 2026-11-05：「题目太少了，优先收集历年真题最近 5 年，再收集网上六级模拟题、练习题」。

   为什么单独一个文件：
     data/quiz.js 是 tools/build_quiz_bank.py 从扫描件 OCR 生成的一次性产物（勿手改），
     手写的题目放这里，由 assets/js/quiz.js 的 bank() 合并，两边互不干扰。

   来源标注（卡片上会显示）：
     · test: '2024年12月真题（卷二）' —— 真题，正文与题干来自公开真题页面
     · test: '模拟题 · 第N组'        —— 按六级同类题材与题型自编，题面与解析都是新的
   真题数量受限于「拿得到的原文」，其余按真题路子补，宁缺毋滥，不硬凑。
*/
window.TW_QUIZ_MORE = {
  "updated": "2026-11-05",
  "sets": [
    {
      "id": "z202412-p2",
      "test": "2024年12月真题（卷二）",
      "no": 2,
      "type": "reading",
      "source": "Cognition 期刊研究报道（改编）",
      "topic": "人文 · 美学",
      "minutes": 9,
      "title": "美在观者眼中吗",
      "heading": "Is beauty really in the eye of the beholder?",
      "body": [
        "Statements like \"beauty is in the eye of the beholder\" are rarely questioned. They have become so embedded in our consciousness that people think it absurd to think otherwise. It might be useful, however, to at least push back on this assumption, because people evaluate environments, situations and people aesthetically. We may find that we still believe it is correct, but we may also find that there is a lot more to the situation than we suppose.",
        "A recent study exploring aesthetic taste was published in Cognition. The results show that people agree very much in their aesthetic evaluation of natural objects, but they disagree more about artifacts, or human-made objects. The study found that shared taste was most common for faces and natural landscapes, but least common among works of architecture and art. The hypothesis is that commonly pleasing features, like proportion or symmetry, are at work. Preferences for natural scenes might be learned through life experiences. Factors like habitability, safety and openness might be preferred as people develop. Some of the details of landscapes change, but the basics are more common, for example water, open spaces and signs of care.",
        "Art and architecture, unlike natural spaces, do not have the same level of exposure. So people do not have the same level of shared taste. It is possible that the lower amount of agreement in the shared taste of artifacts has to do more with elements of style than with behavioural consequences. All of the consequences seem reasonable, or at least possible, but there might be an interesting philosophical conclusion that the researchers did not draw.",
        "It seems that there is an objective ground to our aesthetic preferences. I am not saying this would mean beauty is completely objective, just that there could possibly be general objective principles at work — that is, beauty is not simply in the eye of the beholder. Nature exhibits some of the universal aesthetic features, such as radiance, in a common way throughout the world. It is not exactly the same everywhere, but it is common. A sunset, for example, is similar enough in different places to warrant almost universal appeal.",
        "Possible universal principles of beauty, such as proportion, fittingness and radiance, are general categories that allow for a wide array of embodiments. When people get involved in making artifacts in architecture or art, they apply these very general concepts in unique ways. But the way they apply the principle may not have universal appeal. This is why it is important to experience diverse cultures and their artifacts, because it opens us up to different ways of approaching or constructing beauty. And it is always good to question our assumptions."
      ],
      "questions": [
        {
          "n": 51,
          "stem": "What does the passage say about the statement \"beauty is in the eye of the beholder\"?",
          "options": [
            { "k": "A", "t": "It has hardly ever been disputed." },
            { "k": "B", "t": "It can be interpreted aesthetically." },
            { "k": "C", "t": "Many people have found it absurd." },
            { "k": "D", "t": "People have long been misled by it." }
          ],
          "answer": "A",
          "explain": "定位第一段首句：Statements like \"beauty is in the eye of the beholder\" are rarely questioned。rarely questioned = hardly ever disputed，A 为同义转述。C 偷换主体——觉得「持相反看法才荒谬」的是大众，不是「觉得这句话荒谬」。"
        },
        {
          "n": 52,
          "stem": "What does a recent study exploring aesthetic taste show?",
          "options": [
            { "k": "A", "t": "Aesthetic tastes tend to differ from person to person." },
            { "k": "B", "t": "Natural beauty is rarely surpassed by artificial beauty." },
            { "k": "C", "t": "There is less consensus on objects shaped by human craft." },
            { "k": "D", "t": "There is general agreement on what is pleasing to the eye." }
          ],
          "answer": "C",
          "explain": "定位第二段：people agree very much in their aesthetic evaluation of natural objects, but they disagree more about artifacts。artifact = objects shaped by human craft，disagree more = less consensus，C 正确。A、D 以偏概全：分歧只出现在人工制品上。"
        },
        {
          "n": 53,
          "stem": "Why do people differ in their aesthetic appraisal of artifacts?",
          "options": [
            { "k": "A", "t": "They come out in a great variety of designs." },
            { "k": "B", "t": "They lead to varying behavioural consequences." },
            { "k": "C", "t": "They take up much less natural space than landscapes." },
            { "k": "D", "t": "They come into people's view less often than natural spaces." }
          ],
          "answer": "D",
          "explain": "定位第三段首句：Art and architecture, unlike natural spaces, do not have the same level of exposure. exposure（接触/曝光）少 = come into people's view less often，D 是标准的同义替换。B 是原文明确否定的解释（lower agreement 与 behavioural consequences 无关）。"
        },
        {
          "n": 54,
          "stem": "What does the example of a sunset tell about nature?",
          "options": [
            { "k": "A", "t": "It creates a powerful appeal through its brilliant radiance." },
            { "k": "B", "t": "It displays aesthetic traits in a similar way the world over." },
            { "k": "C", "t": "It embodies beauty with a wide array of aesthetic features." },
            { "k": "D", "t": "It establishes the principles of beauty in a number of ways." }
          ],
          "answer": "B",
          "explain": "定位第四段末两句：Nature exhibits some of the universal aesthetic features... A sunset is similar enough in different places to warrant almost universal appeal。例子是为了证明「自然在世界各地以相似方式呈现美感」，B 正确。A 只说「光芒」一个细节，属以偏概全。"
        },
        {
          "n": 55,
          "stem": "Why do artifacts not always hold universal appeal?",
          "options": [
            { "k": "A", "t": "The appreciation of their beauty is not subject to objective standards." },
            { "k": "B", "t": "The universal principle of beauty prevents a wide array of embodiments." },
            { "k": "C", "t": "The way their creators apply the principle of beauty may not be pleasing to everybody." },
            { "k": "D", "t": "Their creators interpret the universal principle of beauty each in their preferred way." }
          ],
          "answer": "C",
          "explain": "定位末段：But the way they apply the principle may not have universal appeal。C 几乎原句复现；D 只说「各自理解不同」，漏掉了「因此不具普遍吸引力」这个结论，属于「半对」的干扰项。"
        }
      ],
      "translation": "「美在观者眼中」这类说法很少被质疑。它已深深嵌入我们的意识，以致人们觉得持相反看法才是荒谬的。不过，对这种假定稍加反驳可能是有益的，因为人们确实在用审美的方式评价环境、情境和人。我们也许会发现自己仍然相信它是对的，但也可能发现情况远比我们设想的复杂。\n一项探索审美品味的新研究发表在《 Cognition 》上。结果显示，人们对自然物体的审美评价高度一致，但对人工制品分歧更大。研究发现，共同品味在面孔与自然风景上最常见，在建筑与艺术作品中最少见。假说是：比例、对称这类普遍讨喜的特征在起作用。对自然景色的偏好可能是通过生活经验习得的：宜居、安全、开阔等因素会随人的成长被偏好。景色的细节会变，但基本要素更普遍，例如水、开阔空间和有人照料的痕迹。\n与自然空间不同，艺术与建筑的「曝光度」不同，所以人们的共同品味程度也不同。人工制品共同品味一致性更低，可能更多与风格要素有关，而非行为后果。这些后果听起来都合理、至少可能，但研究者没有得出一个有趣的哲学结论。\n我们的审美偏好似乎有客观基础。我并不是说美因此完全客观，而是说可能存在普遍的客观原则——也就是说，美并不全在观者眼中。自然在世界各地以相似方式展现某些普遍的美学特征，比如光辉。它不是处处相同，但很普遍。例如，日落在不同地方都足够相似，几乎能引起普遍的喜爱。\n比例、适宜、光辉这些可能的普遍美学原则，都是允许大量具体呈现的一般范畴。当人们参与建筑或艺术的人工创作时，会以独特方式运用这些非常一般的概念。但他们运用原则的方式未必具有普遍吸引力。这就是为什么体验不同文化及其制品很重要——它让我们接触到接近或建构美的不同方式。而且，质疑自己的假定永远是好事。"
    },
    {
      "id": "sim-drive-ethics",
      "test": "模拟题 · 第9组",
      "no": 1,
      "type": "reading",
      "source": "按 The Economist 风格自编",
      "topic": "科技 · 伦理",
      "minutes": 8,
      "title": "自动驾驶的道德算法",
      "heading": "Who should a driverless car protect?",
      "body": [
        "Every driver makes hundreds of small ethical decisions without noticing. A driverless car has to make the same decisions in advance, in code, and defend them afterwards. That is why the arrival of autonomous vehicles has produced an unusually public argument about something engineers rarely discuss: whose safety counts for more.",
        "The most widely cited guidelines, published in Germany in 2017, rule out any ranking of human lives. A car may not decide that a pensioner is worth less than a child. In practice, though, every braking distance implies such a ranking: a system tuned to protect passengers will, in some rare situations, be less protective of pedestrians. The guidelines resolve the contradiction by forbidding programmers to use personal data such as age, and by requiring that any unavoidable harm be distributed without regard to who is involved.",
        "Critics argue that this is avoidance rather than an answer. If a car cannot distinguish a child from an adult, it also cannot avoid the situation in which that distinction would have saved a life. Defenders reply that the alternative — teaching a machine to price human beings — is worse, not because the arithmetic is difficult but because the moment such arithmetic exists, someone will be tempted to adjust it.",
        "There is a second, quieter problem. Because autonomous cars are expected to reduce accidents overall, manufacturers fear that any single highly publicised crash will be treated as evidence that the technology is unsafe. The result, several researchers have noted, is a strong incentive to design for the situations that generate headlines rather than the situations that generate injuries. A car that hesitates at every crossing is annoying; a car that kills a pedestrian at a crossing is a scandal. The incentives do not point in the same direction.",
        "None of this means the technology should be delayed. It means the argument about values has to happen before the code is written, in public, and with the numbers on the table. Engineers can build almost anything; they cannot decide on our behalf what a life is worth, and they should not be asked to."
      ],
      "questions": [
        {
          "n": 1,
          "stem": "Why does the author say driverless cars raise an unusual public argument?",
          "options": [
            { "k": "A", "t": "Because they make ethical choices that human drivers make unconsciously." },
            { "k": "B", "t": "Because they are more dangerous than human-driven cars." },
            { "k": "C", "t": "Because their software is written by foreign companies." },
            { "k": "D", "t": "Because passengers refuse to accept them." }
          ],
          "answer": "A",
          "explain": "定位第一段第二句：A driverless car has to make the same decisions in advance, in code。人凭本能做的伦理判断，机器必须预先写死并公开辩护，所以争论是公开的，A 正确。文中并未说它更危险（第四段反而说「总体减少事故」）。"
        },
        {
          "n": 2,
          "stem": "What do the German guidelines forbid?",
          "options": [
            { "k": "A", "t": "Using any data about pedestrians." },
            { "k": "B", "t": "Ranking the value of different human lives." },
            { "k": "C", "t": "Testing autonomous cars on public roads." },
            { "k": "D", "t": "Protecting passengers at the expense of others." }
          ],
          "answer": "B",
          "explain": "定位第二段首句：rule out any ranking of human lives，rule out = forbid，B 直接对应。A 是扩大化——禁用的是年龄等个人数据，不是「任何行人数据」。"
        },
        {
          "n": 3,
          "stem": "What is the critics' main objection?",
          "options": [
            { "k": "A", "t": "The guidelines avoid the hard question instead of answering it." },
            { "k": "B", "t": "The guidelines are too expensive to implement." },
            { "k": "C", "t": "The guidelines were written without engineers." },
            { "k": "D", "t": "The guidelines make cars drive too slowly." }
          ],
          "answer": "A",
          "explain": "定位第三段首句：Critics argue that this is avoidance rather than an answer。avoidance = avoid the question，A 正确。"
        },
        {
          "n": 4,
          "stem": "What incentive do manufacturers have, according to researchers?",
          "options": [
            { "k": "A", "t": "To make cars as cheap as possible." },
            { "k": "B", "t": "To design for accidents that attract headlines rather than common injuries." },
            { "k": "C", "t": "To hide crash data from regulators." },
            { "k": "D", "t": "To delay the launch of autonomous vehicles." }
          ],
          "answer": "B",
          "explain": "定位第四段：a strong incentive to design for the situations that generate headlines rather than the situations that generate injuries。B 几乎是原句，注意 rather than 前后的对比方向别弄反。"
        },
        {
          "n": 5,
          "stem": "What is the author's conclusion?",
          "options": [
            { "k": "A", "t": "The technology should be delayed until the rules are clear." },
            { "k": "B", "t": "Engineers should be trusted to settle the ethical questions." },
            { "k": "C", "t": "Society must debate the values publicly before the code is written." },
            { "k": "D", "t": "Autonomous cars should never be allowed on public roads." }
          ],
          "answer": "C",
          "explain": "定位末段第二句：the argument about values has to happen before the code is written, in public, and with the numbers on the table。C 是原文的改写；A 与首句 None of this means the technology should be delayed 直接矛盾。"
        }
      ],
      "translation": "每个司机都在不知不觉中做出上百个小伦理决定。无人驾驶汽车必须把这些决定提前做出来、写进代码，并在事后为它们辩护。这就是为什么自动驾驶的到来引发了一场异常公开的争论，争论的正是工程师很少讨论的事：谁的安全更重要。\n2017 年德国发布、被引用最广的准则，禁止对人的生命做任何排序——车不能判定一位老人不如一个孩子重要。但实践中，每一段刹车距离都隐含着这种排序：一个偏向保护乘客的系统，在某些罕见情形下对行人的保护就会弱一些。准则的化解办法是禁止程序员使用年龄这类个人数据，并要求任何不可避免的伤害都不考虑牵涉的是谁地加以分配。\n批评者认为这是回避而非回答。如果车分辨不出孩子和成人，它也就无法避免那种「若分辨得出本可救命」的情形。支持者回应说，另一种选择——教机器给人命标价——更糟，不是因为算术难，而是因为这种算术一旦存在，就会有人想调整它。\n还有第二个更安静的问题。由于人们预期自动驾驶总体上会减少事故，厂商担心任何一起被高度曝光的撞车都会被当作「这项技术不安全」的证据。多位研究者指出，结果就是一种强烈动机：为「制造头条的情形」而设计，而不是为「制造伤者的情形」而设计。在每个路口都犹豫的车很烦人，而在路口撞死行人的车是丑闻。这两个激励并不指向同一方向。\n这并不意味着这项技术该被推迟。它意味着关于价值的争论必须在代码写就之前、在公开场合、把数字摆上桌面地进行。工程师几乎能造出任何东西；但他们不能替我们决定一条命值多少，也不该被要求这么做。"
    },
    {
      "id": "sim-adaptive",
      "test": "模拟题 · 第9组",
      "no": 2,
      "type": "reading",
      "source": "按 The Guardian 教育版风格自编",
      "topic": "教育 · 技术",
      "minutes": 8,
      "title": "自适应学习到底有没有用",
      "heading": "Does personalised learning live up to its promise?",
      "body": [
        "Adaptive learning platforms are sold on a simple promise: instead of teaching everyone the same thing at the same speed, the software watches how each student answers and adjusts what comes next. Get a question wrong and the system offers an easier one; get three right in a row and it moves on. Investors have been persuaded. Schools in England alone spent an estimated two hundred million pounds on such platforms last year.",
        "The evidence is more modest than the marketing. A review of thirty-eight controlled trials found an average improvement of about two months of additional progress — real, but well below the gains associated with ordinary things like small-group tutoring. More troubling, the review found that the effect was close to zero in the studies that ran for more than a year. Whatever the platform adds seems to fade once the novelty does.",
        "There is a plausible explanation. Adaptive systems are good at what can be measured cheaply: whether a student can produce the right answer. They are poor at what cannot: whether the student understands why the answer is right, or could use the idea in a different context. A student who has learned to match the pattern of a question to a stored answer will move quickly through the levels while learning very little. The software has no way of knowing the difference, because both students produce the same score.",
        "None of this means the technology is useless. Teachers interviewed for the review were broadly positive, but for a different reason than the vendors advertise: the dashboards told them which students had been quietly stuck for weeks. Used as a diagnostic instrument rather than a substitute teacher, the platforms looked considerably better. The gains were largest where a teacher changed what she did in class as a result.",
        "That conclusion is less exciting than the promise, and harder to sell. But it matches what is known about almost every educational technology of the past century, from radio to tablets: the tool rarely teaches anyone anything on its own. What it can do is give a good teacher better information, faster."
      ],
      "questions": [
        {
          "n": 1,
          "stem": "How does an adaptive learning platform work?",
          "options": [
            { "k": "A", "t": "It gives every student the same material at the same pace." },
            { "k": "B", "t": "It changes the next question according to the student's answers." },
            { "k": "C", "t": "It replaces the teacher with recorded video lessons." },
            { "k": "D", "t": "It groups students according to their ages." }
          ],
          "answer": "B",
          "explain": "定位第一段第二句：the software watches how each student answers and adjusts what comes next。B 是其概括；A 恰是它声称要取代的做法。"
        },
        {
          "n": 2,
          "stem": "What did the review of thirty-eight trials find?",
          "options": [
            { "k": "A", "t": "The platforms produced no measurable improvement at all." },
            { "k": "B", "t": "The improvement was smaller than that of small-group tutoring." },
            { "k": "C", "t": "The improvement increased the longer the study ran." },
            { "k": "D", "t": "The platforms worked better in primary schools than secondary ones." }
          ],
          "answer": "B",
          "explain": "定位第二段：an average improvement of about two months... well below the gains associated with ordinary things like small-group tutoring。B 正确；C 与「超过一年效果接近零」相反；A 过头了（「真实但有限」）。"
        },
        {
          "n": 3,
          "stem": "Why can a student move quickly through the levels while learning little?",
          "options": [
            { "k": "A", "t": "Because the levels are too easy for most students." },
            { "k": "B", "t": "Because the software rewards speed rather than understanding." },
            { "k": "C", "t": "Because the student has learned to match question patterns to stored answers." },
            { "k": "D", "t": "Because the questions repeat themselves." }
          ],
          "answer": "C",
          "explain": "定位第三段：A student who has learned to match the pattern of a question to a stored answer will move quickly through the levels while learning very little。C 原句复现；关键在于「软件分不出两者，因为分数一样」。"
        },
        {
          "n": 4,
          "stem": "Why were teachers interviewed broadly positive about the platforms?",
          "options": [
            { "k": "A", "t": "The dashboards showed them which students had been stuck." },
            { "k": "B", "t": "The platforms saved them a great deal of marking." },
            { "k": "C", "t": "The platforms improved their students' exam results." },
            { "k": "D", "t": "The platforms reduced the size of their classes." }
          ],
          "answer": "A",
          "explain": "定位第四段：the dashboards told them which students had been quietly stuck for weeks。这是「诊断工具」的价值，A 正确；注意作者特意强调「理由和厂商宣传的不一样」。"
        },
        {
          "n": 5,
          "stem": "What is the author's overall view?",
          "options": [
            { "k": "A", "t": "Educational technology rarely teaches anyone anything on its own." },
            { "k": "B", "t": "Adaptive platforms are a waste of public money." },
            { "k": "C", "t": "Radio and tablets failed because teachers resisted them." },
            { "k": "D", "t": "Platforms will soon replace teachers in large classes." }
          ],
          "answer": "A",
          "explain": "定位末段：the tool rarely teaches anyone anything on its own. What it can do is give a good teacher better information, faster。A 是作者的核心判断；B 过头——作者明确说「这不意味着技术无用」。"
        }
      ],
      "translation": "自适应学习平台的卖点很简单：不再用同样的内容、同样的速度教所有人，而是由软件观察每个学生怎么答题，再调整接下来给什么。答错就给一道更简单的；连对三题就往下走。投资人被说服了。仅英格兰一地，学校去年在这类平台上估计花掉了两亿英镑。\n证据比营销克制得多。一项对三十八项对照试验的综述发现，平均提升约相当于多学两个月——真实，但远低于小组辅导这类平常做法带来的收益。更麻烦的是，综述发现在持续时间超过一年的研究里，效果接近于零。无论平台带来了什么，新鲜感一过似乎就消退了。\n有一个说得通的解释。自适应系统擅长的是能廉价测量的东西：学生能不能给出正确答案。它不擅长的是无法廉价测量的东西：学生是否理解为什么这个答案对，或者能否把这个概念用到别的语境。一个学会了「把题目的模式匹配到记忆里的答案」的学生，会飞快地升级，却几乎没学到什么。软件无从分辨，因为两种学生给出同样的分数。\n这并不意味着技术无用。接受访谈的教师整体是正面的，但理由和厂商宣传的不一样：仪表盘告诉他们哪些学生已经默默卡了好几周。当作诊断工具而不是代课老师时，这些平台看起来好得多。收益最大的，是老师据此改变了自己课堂做法的地方。\n这个结论没有那个承诺激动人心，也不好卖。但它与过去一百年几乎每一种教育技术的经验相符，从收音机到平板电脑：工具本身很少能教会任何人任何东西。它能做的，是让一位好老师更快地拿到更好的信息。"
    },
    {
      "id": "sim-cloze-crops",
      "test": "模拟题 · 第10组",
      "no": 3,
      "type": "cloze",
      "source": "按 BBC Future 风格自编",
      "topic": "农业 · 环境",
      "minutes": 10,
      "title": "被遗忘的作物",
      "heading": "Are forgotten crops the future of food?",
      "body": [
        "Just four crops — wheat, maize, rice and soybean — supply about two-thirds of the world's food. That narrow base has made the global food system remarkably efficient, but it has also made it 【1】. A single disease that attacks wheat can threaten the diets of billions of people, and climate change is expected to make such 【2】 more frequent.",
        "For decades, agricultural research 【3】 the goal of higher yields in these four crops. The results were impressive: the Green Revolution of the 1960s is estimated to have saved a billion lives. But the 【4】 was that thousands of locally adapted crops were quietly abandoned. The bambara groundnut, a protein-rich plant native to sub-Saharan Africa, was 【5】 during the colonial period, when African women who grew it were punished for doing so.",
        "Today a small but growing group of researchers is trying to bring these crops back. Their argument is not sentimental. Many of the forgotten species grow on poor soil with 【6】 rainfall, exactly the conditions that climate change is expected to spread. Others are richer in micronutrients than the staples that replaced them. In one trial in Malawi, farmers who planted a mix of three local crops harvested more food in a bad year than those who planted maize alone.",
        "The obstacles are commercial rather than agricultural. A farmer will not grow a crop that no one will buy, and a supermarket will not stock a product that customers do not recognise. Building a market takes years, and no single company has an 【7】 to do it, because the crops belong to everyone. Several governments are now experimenting with public purchasing: schools and hospitals buy the grain, which gives farmers a 【8】 buyer while the market develops.",
        "Researchers also point out that the nutritional 【9】 of these crops is not fixed. Breeding programmes are trying to combine the drought tolerance of local varieties with the yield of commercial ones. The work is slow, and it needs 【10】 funding over decades rather than the three-year cycles that most grants allow. But given the alternative — a food system resting on four crops and a changing climate — the case for trying is hard to argue with."
      ],
      "bank": [
        { "k": "A", "w": "vulnerable" },
        { "k": "B", "w": "shocks" },
        { "k": "C", "w": "pursued" },
        { "k": "D", "w": "consequence" },
        { "k": "E", "w": "marginalised" },
        { "k": "F", "w": "unreliable" },
        { "k": "G", "w": "incentive" },
        { "k": "H", "w": "guaranteed" },
        { "k": "I", "w": "composition" },
        { "k": "J", "w": "sustained" },
        { "k": "K", "w": "resistant" },
        { "k": "L", "w": "abundant" },
        { "k": "M", "w": "declined" },
        { "k": "N", "w": "routine" },
        { "k": "O", "w": "legacy" }
      ],
      "questions": [
        {
          "n": 1,
          "stem": "第 1 空",
          "options": [],
          "answer": "A",
          "key": "vulnerable",
          "explain": "形容词辨析。but 后面要与「remarkably efficient」形成转折：效率高但**脆弱**。vulnerable「易受伤害的」符合题意。resistant（有抵抗力的）语义相反；unreliable 指「不可靠」，与后文「一场病害威胁数十亿人」的脆弱性不完全对应。"
        },
        {
          "n": 2,
          "stem": "第 2 空",
          "options": [],
          "answer": "B",
          "key": "shocks",
          "explain": "名词辨析，且要用复数（such ___ 指前面「一场病害」这类事件）。shocks「冲击」最贴合：气候变暖会让这类冲击更频繁。routine 是形容词/单数名词，与 more frequent 不搭。"
        },
        {
          "n": 3,
          "stem": "第 3 空",
          "options": [],
          "answer": "C",
          "key": "pursued",
          "explain": "动词辨析 + 时态。主语 agricultural research，宾语 the goal of higher yields，搭配 pursue a goal「追求目标」最自然，且需过去式（For decades...）。declined 是「下降/拒绝」，与 goal 不搭。"
        },
        {
          "n": 4,
          "stem": "第 4 空",
          "options": [],
          "answer": "D",
          "key": "consequence",
          "explain": "名词辨析。But the ___ was that... 需要一个能带表语从句的名词：consequence「（不好的）结果」正好引出「数千种本地作物被悄悄放弃」。legacy 也可带从句，但中性偏褒，不如 consequence 贴合负面语境。"
        },
        {
          "n": 5,
          "stem": "第 5 空",
          "options": [],
          "answer": "E",
          "key": "marginalised",
          "explain": "动词辨析（被动语态）。后文 when African women who grew it were punished——被惩罚 ⇒ 被边缘化。marginalise「使边缘化」与「殖民时期」语境吻合；declined 是不及物「下降」，不能这样用。"
        },
        {
          "n": 6,
          "stem": "第 6 空",
          "options": [],
          "answer": "F",
          "key": "unreliable",
          "explain": "形容词辨析。poor soil with ___ rainfall，且后文说「正是气候变化将扩散的条件」——所以是「不可靠的降雨」。unreliable 正确；abundant（充沛的）与「贫瘠土壤 + 恶劣条件」矛盾。"
        },
        {
          "n": 7,
          "stem": "第 7 空",
          "options": [],
          "answer": "G",
          "key": "incentive",
          "explain": "名词辨析。no single company has an ___ to do it「没有哪家公司有动力去做」，incentive to do sth 是固定搭配（后文紧接 because the crops belong to everyone 解释「公共品无人投资」）。"
        },
        {
          "n": 8,
          "stem": "第 8 空",
          "options": [],
          "answer": "H",
          "key": "guaranteed",
          "explain": "分词作定语。政府/学校集中采购 ⇒ 给农民一个「有保障的」买家，guaranteed buyer。sustained 也能修饰 buyer 但语义是「持续的」，不如「有保障」精确对应 public purchasing 的兜底作用。"
        },
        {
          "n": 9,
          "stem": "第 9 空",
          "options": [],
          "answer": "I",
          "key": "composition",
          "explain": "名词辨析。the nutritional ___ of these crops「营养成分构成」，composition 指「成分、构成」。下文讲育种改良营养，正好对应。"
        },
        {
          "n": 10,
          "stem": "第 10 空",
          "options": [],
          "answer": "J",
          "key": "sustained",
          "explain": "形容词辨析。it needs ___ funding over decades rather than the three-year cycles——与「三年一期的项目经费」对比，需要「长期的、持续的」投入。sustained 正确；abundant 只说「多」，与「周期性」的对比无关。"
        }
      ],
      "translation": "仅小麦、玉米、水稻和大豆四种作物就提供了世界约三分之二的粮食。这种狭窄的基础让全球粮食系统效率极高，但也让它变得脆弱。一场袭击小麦的病害就可能威胁数十亿人的餐桌，而气候变化预计会让这类冲击更频繁。\n几十年来，农业研究追求的是这四种作物更高的产量，成果显著：1960 年代的绿色革命据估计拯救了十亿人的生命。但代价是数千种适应当地的作物被悄悄放弃。原产于撒哈拉以南非洲、富含蛋白质的班巴拉花生，在殖民时期被边缘化——种它的非洲妇女因此受到惩罚。\n今天，一小群但不断增多的研究者正试图把这些作物带回来。他们的理由并不感伤。许多被遗忘的物种能在贫瘠土壤和不可靠的降雨下生长，而这正是气候变化预计会扩散的条件；另一些则比取代它们的口粮作物富含更多微量营养素。在马拉维的一次试验中，同时种三种本地作物的农民，在歉收年收获的粮食比只种玉米的农民更多。\n阻碍不在农业，而在商业。农民不会种没人买的东西，超市不会上架顾客不认识的商品。建立市场需要多年，而没有哪家公司有动力去做，因为这些作物属于所有人。若干政府正在试验公共采购：学校和医院来买粮，在市场发育期间给农民一个有保障的买家。\n研究者还指出，这些作物的营养构成并非注定不变。育种项目正试图把本地品种的抗旱性与商业品种的产量结合起来。这项工作很慢，需要几十年持续的资金，而不是多数基金允许的三年周期。但考虑到另一种选择——一个靠四种作物支撑、气候又在变化的粮食系统——尝试的理由很难被反驳。"
    },
    {
      "id": "sim-match-city",
      "test": "模拟题 · 第10组",
      "no": 1,
      "type": "match",
      "source": "按 The Guardian 城市版风格自编",
      "topic": "社会 · 城市",
      "minutes": 12,
      "title": "十五分钟城市",
      "heading": "The 15-minute city: attractive idea, difficult politics",
      "paras": [
        { "k": "A", "text": "The idea is simple enough to fit on a poster: everyone should be able to reach the things they need — shops, schools, a doctor, a park — within fifteen minutes on foot or by bicycle. The concept was developed by Carlos Moreno, a professor based in Paris, and has since been adopted, at least in name, by mayors from Milan to Melbourne." },
        { "k": "B", "text": "Behind the slogan is a serious argument about how cities have been built since the Second World War. Zoning laws separated homes from workplaces and shops, on the assumption that everyone would drive. The result was cheap land and fast roads, but also long commutes, expensive infrastructure and neighbourhoods that empty out during the day." },
        { "k": "C", "text": "Supporters point to health benefits. A review of studies in eight countries found that residents of walkable neighbourhoods were significantly more likely to meet recommended levels of physical activity, and less likely to be overweight, even after controlling for income. The effect was largest among older residents, for whom a nearby shop is not a convenience but a condition of independence." },
        { "k": "D", "text": "The environmental case is more complicated than it first appears. Moving a shop closer to homes reduces car trips, but only if the shop is viable at a smaller scale. Several studies have found that dense local services can coexist with heavy car use when residents also commute long distances to work. Distance travelled, not distance to the nearest bakery, is what determines emissions." },
        { "k": "E", "text": "The political difficulty is housing. The most effective way to bring services within walking distance is to allow more people to live near them, which means building upward and allowing denser development in areas that are currently low-rise. Residents who already own houses in those areas often oppose such changes, and they are usually the people who vote." },
        { "k": "F", "text": "Paris has tried to square this circle by concentrating new housing near public transport hubs while simultaneously adding trees, school playgrounds and cycle lanes. The city reports that more than half of its residents now live within fifteen minutes of essential services, though independent researchers note that the measure depends heavily on what counts as essential." },
        { "k": "G", "text": "A different objection comes from researchers who study inequality. Making a neighbourhood more pleasant tends to raise rents, and the people who benefit least from the improvement are often the ones who are pushed out by it. In several cities, improvements to cycling infrastructure have been followed by measurable increases in housing costs along the new routes." },
        { "k": "H", "text": "Some cities have responded by pairing transport improvements with rent controls or requirements that a share of new housing be let below market rates. These policies are contested, and the evidence on whether they work is mixed, but the alternative — improving a neighbourhood and watching its poorest residents leave — is politically unsustainable in the long run." },
        { "k": "I", "text": "There is also a practical question of scale. Small towns and rural areas cannot support frequent buses or a full range of services within a short walk; the fifteen-minute standard simply does not describe them. Applied carelessly, the idea can become an argument for concentrating investment in cities that already have the most." },
        { "k": "J", "text": "None of this makes the idea worthless. It has shifted the terms of an old argument: instead of asking how quickly a city can move cars, planners now at least ask how far a resident has to travel to live a normal life. That is progress, even if the poster is simpler than the policy." }
      ],
      "bank": [],
      "questions": [
        { "n": 36, "stem": "A professor in Paris is credited with developing the concept.", "options": [], "answer": "A", "explain": "A 段：The concept was developed by Carlos Moreno, a professor based in Paris。人名 + professor + Paris 三重定位。" },
        { "n": 37, "stem": "Zoning rules after the Second World War assumed that people would travel by car.", "options": [], "answer": "B", "explain": "B 段：Zoning laws separated homes from workplaces and shops, on the assumption that everyone would drive。on the assumption = assumed。" },
        { "n": 38, "stem": "Older people gain independence from having a shop nearby.", "options": [], "answer": "C", "explain": "C 段末：for whom a nearby shop is not a convenience but a condition of independence。condition of independence = 独立的前提。" },
        { "n": 39, "stem": "Total distance travelled matters more for emissions than distance to the nearest shop.", "options": [], "answer": "D", "explain": "D 段末：Distance travelled, not distance to the nearest bakery, is what determines emissions。not... but 的对比直接对应题干。" },
        { "n": 40, "stem": "Those who already own houses often oppose denser development.", "options": [], "answer": "E", "explain": "E 段：Residents who already own houses in those areas often oppose such changes, and they are usually the people who vote。"
        },
        { "n": 41, "stem": "Whether residents live within fifteen minutes depends on how essential services are defined.", "options": [], "answer": "F", "explain": "F 段末：independent researchers note that the measure depends heavily on what counts as essential。counts as = is defined as。" },
        { "n": 42, "stem": "Improving a neighbourhood can push out the people who would benefit most.", "options": [], "answer": "G", "explain": "G 段：the people who benefit least from the improvement are often the ones who are pushed out by it（租金上涨导致）。" },
        { "n": 43, "stem": "Some cities link transport improvements to rules keeping rents down.", "options": [], "answer": "H", "explain": "H 段首句：pairing transport improvements with rent controls or requirements that a share of new housing be let below market rates。" },
        { "n": 44, "stem": "The standard does not describe small towns and rural areas.", "options": [], "answer": "I", "explain": "I 段：Small towns and rural areas cannot support... the fifteen-minute standard simply does not describe them。" },
        { "n": 45, "stem": "The idea has changed what planners now ask about a city.", "options": [], "answer": "J", "explain": "J 段：It has shifted the terms of an old argument: instead of asking how quickly a city can move cars, planners now at least ask how far a resident has to travel to live a normal life。" }
      ],
      "translation": "这个想法简单到可以印在海报上：每个人都应该能在十五分钟内步行或骑车到达需要的东西——商店、学校、诊所、公园。概念由常驻巴黎的 Carlos Moreno 教授提出，此后至少名义上被从米兰到墨尔本的市长们采纳。\n口号背后是对二战后城市建设方式的严肃批评。分区法规把住宅与工作地点、商店分开，前提是人人开车。结果是便宜的土地和快速的道路，但也带来长通勤、昂贵的基础设施，以及白天变成空城的社区。\n支持者强调健康收益。一项覆盖八国研究的综述发现，居住在宜步行社区的居民明显更可能达到建议的身体活动量，超重的可能性更低，即便控制收入因素后依然如此。这一效应在老年居民中最大——对他们而言，附近的商店不是便利，而是独立生活的前提。\n环境方面的论证比初看更复杂。把商店搬到离家更近处会减少车程，但前提是这家店在小规模下能存活。多项研究发现，即便本地服务密集，只要居民仍要长途通勤，汽车使用量也可能很高。决定排放的是总出行距离，而不是到最近面包店的距离。\n政治上的难点在住房。要让服务进入步行范围，最有效的办法是允许更多人在附近居住，这意味着向上建、允许在目前低层的区域提高密度。而在这些区域已有房产的居民常常反对这类改变，他们通常也正是投票的人。\n巴黎试图兼顾两者：把新增住房集中在公共交通枢纽附近，同时增种树木、增建学校操场与自行车道。市政府称如今过半居民在十五分钟内可达基本服务，不过独立研究者指出，这个衡量在很大程度上取决于什么算「基本」。\n另一种反对意见来自研究不平等问题的学者。让一个社区变得更宜人往往会推高租金，而从改善中受益最少的人，常常正是被改善挤出去的人。在若干城市，自行车设施的改善之后，新线路沿线的住房成本都出现了可测量的上涨。\n有些城市的应对是把交通改善与租金管制、或要求一定比例新房低于市场价出租绑定。这些政策存在争议，效果证据也不一，但另一种选择——改善一个社区，然后看着最贫困的居民搬走——长期看政治上难以为继。\n还有规模上的实际问题。小城镇和乡村无法在短距离内支撑频繁的公交或全套服务；十五分钟标准根本描述不了它们。若不加分辨地套用，这个想法可能变成「把投资进一步集中到已经最好的城市」的理由。\n这些都不意味着这个想法没有价值。它改变了一场老争论的措辞：规划者如今至少会问「一个居民要走多远才能过上正常生活」，而不只是问「这座城市多快能疏散车流」。这就是进步，哪怕海报总比政策简单。"
    }
  ]
};
