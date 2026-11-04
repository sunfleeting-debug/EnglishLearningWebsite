/* 写作板块题库：翻译（汉译英）+ 作文（命题作文）
   ------------------------------------------------------------------
   为什么放静态数据：这两类是主观题，但要「离线也能练」——
   没配 AI 时至少能看到参考译文/范文、字数统计和自评清单；
   配了 AI 才会多出「批改 + 三个候选版本」（见 views/writing.js）。
   题目按六级真题的路子出：翻译偏中国文化/社会/科技，作文偏议论与应用文。
*/
window.TW_WRITING = {
  "updated": "2026-11-04",
  "items": [
    {
      "id": "tr-highspeed",
      "type": "trans",
      "title": "中国高铁",
      "sub": "科技 · 社会发展",
      "minutes": 30,
      "prompt": "中国高铁的发展速度令世界瞩目。截至2024年底，中国高铁运营里程已超过4.8万公里，占全球高铁总里程的三分之二以上。高铁把相隔千里的城市连接起来，北京到上海只需四个多小时。它不仅极大地方便了人们的出行，也带动了沿线城市的经济发展。越来越多的外国游客选择乘坐高铁，亲身感受“中国速度”。",
      "require": "把上面这段文字翻译成英文，尽量用六级常见的表达，不必逐字对应。",
      "sample": "The development of China's high-speed railway has attracted worldwide attention. By the end of 2024, the mileage of high-speed rail in operation in China had exceeded 48,000 kilometers, accounting for more than two-thirds of the world's total. High-speed trains connect cities that are hundreds of miles apart, and it takes only a little over four hours to travel from Beijing to Shanghai. They have not only made travel far more convenient but also boosted the economy of the cities along the lines. A growing number of foreign tourists choose to travel by high-speed train so that they can experience \"China's speed\" for themselves.",
      "tips": [
        "「运营里程」用 mileage in operation / operating length，别硬译成 running kilometers",
        "「占……的三分之二以上」用 account for more than two-thirds of",
        "「带动经济发展」可用 boost / drive the economy，比 promote the development 更地道"
      ]
    },
    {
      "id": "tr-tea",
      "type": "trans",
      "title": "中国茶文化",
      "sub": "文化 · 传统",
      "minutes": 30,
      "prompt": "茶是中国人日常生活中最常见的饮品。相传中国人饮茶的历史已有四千多年。唐代以后，饮茶之风普及全国，形成了独特的茶文化。中国人不仅讲究茶叶的品种和泡茶的水温，也讲究饮茶的环境与心情。如今，茶馆遍布城市的大街小巷，成为人们会友、谈事和放松的场所。茶文化也随着交流走向世界，受到越来越多外国朋友的喜爱。",
      "require": "把上面这段文字翻译成英文，注意「讲究」「相传」这类词的英文处理。",
      "sample": "Tea is the most common drink in the daily life of the Chinese people. It is said that the Chinese have been drinking tea for more than four thousand years. After the Tang Dynasty, the practice of tea drinking spread throughout the country and a unique tea culture took shape. Chinese people care not only about the variety of tea leaves and the water temperature for brewing, but also about the surroundings and the mood in which tea is enjoyed. Today teahouses can be found in every corner of cities, where people meet friends, discuss business and relax. With cultural exchanges, tea culture has spread to the rest of the world and won the affection of more and more foreign friends.",
      "tips": [
        "「相传」= It is said that… / Legend has it that…",
        "「讲究」在这里是 care about / pay attention to，不是 stress",
        "「大街小巷」可意译为 every corner of the city，不必逐字翻"
      ]
    },
    {
      "id": "tr-pay",
      "type": "trans",
      "title": "移动支付",
      "sub": "科技 · 生活",
      "minutes": 30,
      "prompt": "在中国，移动支付已经成为一种生活方式。无论购物、就餐还是乘坐公共交通，人们只需用手机扫一下二维码就能完成付款。移动支付不仅节省了时间，还减少了现金携带的风险。对于小商贩来说，它也降低了收款的门槛。与此同时，如何保护个人信息和账户安全，成为人们普遍关心的问题。",
      "require": "把上面这段文字翻译成英文，注意「扫二维码」「门槛」这类说法。",
      "sample": "In China, mobile payment has become a way of life. Whether shopping, dining out or taking public transport, people can pay simply by scanning a QR code with their phones. Mobile payment not only saves time but also reduces the risk of carrying cash. For small vendors, it has also lowered the barrier to collecting payments. Meanwhile, how to protect personal information and account security has become a matter of widespread concern.",
      "tips": [
        "「扫二维码」= scan a QR code，介词用 with their phones",
        "「门槛」= barrier / threshold，lower the barrier to 是常用搭配",
        "「成为人们普遍关心的问题」用 has become a matter of widespread concern，比 people all care about it 正式"
      ]
    },
    {
      "id": "tr-wall",
      "type": "trans",
      "title": "长城",
      "sub": "文化 · 历史",
      "minutes": 30,
      "prompt": "长城是中国古代最伟大的工程之一，全长两万多公里。它的修建始于两千多年前，历代不断加固和延伸，主要用来抵御北方民族的入侵。今天的长城虽然失去了军事作用，却成为中华民族坚韧不拔精神的象征。每年都有大量中外游客前来参观，感受它的雄伟与沧桑。",
      "require": "把上面这段文字翻译成英文，注意时态：讲历史用过去时，讲今天用现在时。",
      "sample": "The Great Wall is one of the greatest projects of ancient China, stretching more than 20,000 kilometers. Its construction began over two thousand years ago, and later dynasties kept reinforcing and extending it, mainly to defend against invasions from the north. Although the Wall no longer serves any military purpose today, it has become a symbol of the perseverance of the Chinese nation. Every year large numbers of visitors from home and abroad come to see it and feel its grandeur and its long history.",
      "tips": [
        "「全长两万多公里」用 stretching more than…，比 whose total length is… 简洁",
        "「抵御入侵」= defend against invasions",
        "「沧桑」不必直译，用 its long history / vicissitudes 均可"
      ]
    },
    {
      "id": "tr-spring",
      "type": "trans",
      "title": "春节",
      "sub": "文化 · 节日",
      "minutes": 30,
      "prompt": "春节是中国最重要的传统节日。每逢春节，无论离家多远，人们都会想办法回家与亲人团聚。除夕之夜，全家人围坐在一起吃年夜饭，看春节联欢晚会。孩子们最期待的是收到长辈给的压岁钱。近年来，虽然过年的方式有所变化，比如越来越多的人选择外出旅游，但团圆的意义始终没有改变。",
      "require": "把上面这段文字翻译成英文，注意「除夕」「压岁钱」这类文化词的表达。",
      "sample": "The Spring Festival is the most important traditional festival in China. Whenever it comes, people will find a way to return home and reunite with their families, no matter how far away they are. On New Year's Eve, the whole family sits together to enjoy the reunion dinner and watch the Spring Festival Gala. What children look forward to most is the lucky money given by their elders. In recent years, although the way people celebrate has changed somewhat — for example, more and more families choose to travel during the holiday — the meaning of reunion has never changed.",
      "tips": [
        "「除夕」= New Year's Eve；「年夜饭」= reunion dinner",
        "「压岁钱」可译 lucky money / red envelopes，首次出现可加一句解释",
        "「无论离家多远」用 no matter how far away they are，句末更自然"
      ]
    },
    {
      "id": "es-timemanage",
      "type": "essay",
      "title": "时间管理的重要性",
      "sub": "议论文 · 校园生活",
      "minutes": 30,
      "prompt": "On the Importance of Time Management for College Students",
      "require": "Write an essay of 150–200 words. You should state your view, give two reasons with examples, and end with a short conclusion.",
      "sample": "For college students, time is perhaps the most precious resource we have, and managing it well makes the difference between a rewarding four years and a regretful one.\n\nTo begin with, good time management keeps us from being driven by deadlines. A student who plans the week ahead can review vocabulary in short daily sessions instead of cramming the night before an exam, which is far more effective for long-term memory. Secondly, it leaves room for things that matter but never seem urgent. Sports, reading and time with friends are usually the first things to be cut when we are busy, yet they are exactly what keeps us healthy and motivated.\n\nAdmittedly, plans can be interrupted. The point is not to follow a schedule rigidly but to know where our hours actually go. Once we can see that, we can decide, deliberately, what deserves them.\n\nIn short, time management is less about squeezing more into a day than about spending the day on what we truly value.",
      "tips": [
        "开头一句话亮观点，不要铺垫太长",
        "两个理由各自配一个具体例子（比空谈 efficient 有说服力）",
        "结尾回到观点，不要引入新论点"
      ]
    },
    {
      "id": "es-shortvideo",
      "type": "essay",
      "title": "短视频对大学生的影响",
      "sub": "议论文 · 社会现象",
      "minutes": 30,
      "prompt": "The Impact of Short Videos on College Students",
      "require": "Write an essay of 150–200 words. Discuss both the benefits and the problems, then give your own opinion.",
      "sample": "Short videos have become part of campus life: a few minutes in a queue or on the bus, and the phone is out. Like most new media, they cut both ways.\n\nOn the positive side, short videos make knowledge accessible. A three-minute clip can explain a grammar point more vividly than a page of notes, and students who cannot afford expensive courses can still learn from excellent teachers. They are also a cheap way to relax after a long day.\n\nThe problems, however, are real. The endless feed is designed to hold attention, and many students find an intended ten-minute break turning into an hour. Worse, constant exposure to brief, punchy content makes sustained reading feel dull, which is precisely the skill that academic study demands.\n\nIn my view, the technology itself is neutral; the danger lies in using it passively. If we set a time limit and treat short videos as a tool rather than a habit, we can enjoy their benefits without paying for them with our concentration.",
      "tips": [
        "双边讨论：先好处后问题，各 2–3 句，别一边倒",
        "用 specifically 的例子（grammar point、排队十分钟）代替笼统说法",
        "结尾给「怎么做」的判断，比单纯说 harmful 更有分量"
      ]
    },
    {
      "id": "es-parttime",
      "type": "essay",
      "title": "大学生该不该做兼职",
      "sub": "议论文 · 校园生活",
      "minutes": 30,
      "prompt": "Should College Students Take Part-time Jobs?",
      "require": "Write an essay of 150–200 words. Give your opinion and support it with reasons and examples.",
      "sample": "Whether college students should take part-time jobs has long been debated. In my opinion, a suitable part-time job is worth trying, provided that it does not come at the cost of study.\n\nFirst, work teaches what classrooms cannot. Standing behind a counter for a month teaches punctuality, patience and how to deal with a difficult customer — lessons no lecture can deliver. Second, earning money changes how we spend it. Students who have worked for a week's pay tend to think twice before buying things they do not need.\n\nStill, the risk is obvious. Some students take on too many hours, skip classes and end up exhausted in both roles. A job that has nothing to do with one's major and offers no skills is simply a way of selling time cheaply.\n\nTherefore, the question is not whether to work but what kind of work to choose. If the job is limited in hours and related to our interests, it is an education in itself.",
      "tips": [
        "观点句用 provided that / as long as 加条件，显得有分寸",
        "理由后紧跟例子（stand behind a counter），避免空泛",
        "承认反方（the risk is obvious）再收回来，六级作文的加分套路"
      ]
    },
    {
      "id": "es-volunteer",
      "type": "essay",
      "title": "志愿者申请信",
      "sub": "应用文 · 书信",
      "minutes": 30,
      "prompt": "A Letter of Application for a Volunteer Program",
      "require": "You are Li Ming. Write a letter of about 150 words to the organizer of an international cultural festival, applying to be a volunteer. State your reasons and your relevant experience.",
      "sample": "Dear Sir or Madam,\n\nI am Li Ming, a junior majoring in English at Central South University. I am writing to apply for a volunteer position at the International Cultural Festival to be held next month.\n\nI believe I am well prepared for this role. My major has trained me to communicate in English with confidence, and I have served as a guide at two campus events, where I learned to explain a schedule clearly and to stay calm when plans change. In addition, I have studied the history of our city for two years, so I would be glad to introduce it to guests from abroad.\n\nI am available throughout the festival, including weekends, and I am willing to take any assignment, from reception to translation. I would appreciate the chance to contribute, and I look forward to your reply.\n\nYours sincerely,\nLi Ming",
      "tips": [
        "书信格式：称呼 → 自我介绍与目的 → 理由/经历 → 可用时间与态度 → 结束语",
        "「经历」要具体（两次校园引导、两年研究城市历史），别只说 I am qualified",
        "结尾一句 I look forward to your reply. 必须有"
      ]
    },
    {
      "id": "es-reading",
      "type": "essay",
      "title": "经典阅读的价值",
      "sub": "议论文 · 人文",
      "minutes": 30,
      "prompt": "The Value of Reading Classics",
      "require": "Write an essay of 150–200 words. Explain why classics still matter today and how we should read them.",
      "sample": "In an age of ten-second videos, reading a nineteenth-century novel can feel like a waste of time. Yet classics remain valuable precisely because they are slow.\n\nA classic has survived the judgement of generations. Whatever was merely fashionable in its own day has been forgotten; what remains speaks to something in human nature that does not change. When we read about a character's ambition or regret, we are not learning about the past so much as recognising ourselves.\n\nClassics also train a kind of attention that modern media rarely ask for. Following a long argument or a subtle description teaches patience with complexity — a habit that transfers to reading a contract, a report or an academic paper.\n\nTo benefit from them, we should stop treating classics as homework. Read a little each day, allow ourselves to skip what bores us, and discuss what we read with friends. A classic is not a monument to admire from a distance but a conversation to join.",
      "tips": [
        "开头用对比（十秒短视频 vs 十九世纪小说）迅速建立张力",
        "「经典为什么还重要」给两个层次：经过时间检验 + 训练注意力",
        "给方法（每天一点、允许跳过、与人讨论）比只讲道理更实用"
      ]
    },
    {
      "id": "es-stress",
      "type": "essay",
      "title": "如何应对大学压力",
      "sub": "说明文 · 建议",
      "minutes": 30,
      "prompt": "How to Deal with Stress in College",
      "require": "Write an essay of 150–200 words. Describe the main sources of stress and suggest practical ways to handle them.",
      "sample": "Stress is almost unavoidable in college. Exams, part-time work, and the pressure to decide what comes next often arrive at the same time, and the feeling of falling behind can be overwhelming.\n\nSome of this stress is structural, and the first step is to name it. Students who write down what actually worries them usually find the list shorter than the anxiety suggests: two deadlines, one difficult course, one relationship. A named problem can be planned for; a vague dread cannot.\n\nPractical habits help more than willpower. Regular sleep, thirty minutes of exercise, and studying in fixed blocks rather than marathon sessions all lower the baseline level of tension. It also helps to talk — to a classmate who is in the same boat, or to a counsellor when the problem goes deeper than a busy week.\n\nFinally, it is worth remembering that stress is a signal, not a verdict. It tells us something needs attention; it does not tell us we are failing. Handled early and honestly, it can even push us to organise our lives better.",
      "tips": [
        "先分类（结构性压力 vs 自我加压），再给方法，结构清楚",
        "方法要具体到「每天 30 分钟运动」「固定时段学习」，不要只写 relax",
        "结尾把 stress 重新定义为 signal，收得住"
      ]
    }
  ]
};
