(function () {
  'use strict';

  // Original graded practice material written for this website.
  // Each unit grows from a useful phrase into one complete sentence.
  window.TW_SENTENCE_COURSES = [
    {
      id: 'everyday',
      title: '日常生活，从第一句开始',
      level: 'A1',
      category: '日常生活',
      description: '从吃饭、购物到家务与休息，练习最常用的日常表达。',
      units: [
        {
          id: 'everyday-01', title: '起床喝水',
          steps: [
            { en: 'a glass of water', zh: '一杯水' },
            { en: 'drink a glass of water', zh: '喝一杯水' },
            { en: 'I drink a glass of water every morning.', zh: '我每天早上喝一杯水。' }
          ]
        },
        {
          id: 'everyday-02', title: '一起吃早饭',
          steps: [
            { en: 'have breakfast', zh: '吃早饭' },
            { en: 'have breakfast with my family', zh: '和我的家人一起吃早饭' },
            { en: 'I have breakfast with my family at home.', zh: '我在家和家人一起吃早饭。' }
          ]
        },
        {
          id: 'everyday-03', title: '我的小爱好',
          steps: [
            { en: 'cook dinner', zh: '做晚饭' },
            { en: 'like to cook dinner', zh: '喜欢做晚饭', alternatives: ['like cooking dinner'] },
            { en: 'I like to cook dinner for my friends.', zh: '我喜欢为朋友们做晚饭。', alternatives: ['I like cooking dinner for my friends.'] }
          ]
        },
        {
          id: 'everyday-04', title: '晚上的习惯',
          steps: [
            { en: 'at night', zh: '在夜里' },
            { en: 'drink coffee at night', zh: '在夜里喝咖啡' },
            { en: 'I do not drink coffee at night.', zh: '我夜里不喝咖啡。', alternatives: ["I don't drink coffee at night."] }
          ]
        },
        {
          id: 'everyday-05', title: '钥匙在哪儿',
          steps: [
            { en: 'my keys', zh: '我的钥匙' },
            { en: 'Where are my keys?', zh: '我的钥匙在哪儿？' },
            { en: 'Are my keys on the kitchen table?', zh: '我的钥匙在厨房的桌子上吗？' }
          ]
        },
        {
          id: 'everyday-06', title: '周日去购物',
          steps: [
            { en: 'go shopping', zh: '去购物' },
            { en: 'go shopping on Sundays', zh: '每逢周日去购物' },
            { en: 'We usually go shopping on Sundays.', zh: '我们通常每逢周日去购物。' }
          ]
        },
        {
          id: 'everyday-07', title: '帮忙洗碗',
          steps: [
            { en: 'wash the dishes', zh: '洗碗', alternatives: ['do the dishes'] },
            { en: 'help me wash the dishes', zh: '帮我洗碗', alternatives: ['help me to wash the dishes', 'help me do the dishes'] },
            { en: 'Can you help me wash the dishes?', zh: '你能帮我洗碗吗？', alternatives: ['Can you help me to wash the dishes?', 'Can you help me do the dishes?'] }
          ]
        },
        {
          id: 'everyday-08', title: '早点休息',
          steps: [
            { en: 'go to bed early', zh: '早点上床睡觉' },
            { en: 'I am tired today.', zh: '我今天很累。', alternatives: ["I'm tired today."] },
            { en: 'I am tired, so I want to go to bed early.', zh: '我累了，所以想早点上床睡觉。', alternatives: ["I'm tired, so I want to go to bed early."] }
          ]
        }
      ]
    },
    {
      id: 'time-place',
      title: '说清时间与地点',
      level: 'A1',
      category: '时间地点',
      description: '练习时间介词、方位和简单过去时，把什么时候、在哪里说清楚。',
      units: [
        {
          id: 'time-place-01', title: '八点出门',
          steps: [
            { en: 'at eight', zh: '在八点' },
            { en: 'leave home at eight', zh: '八点离开家' },
            { en: 'I leave home at eight every day.', zh: '我每天八点离开家。' }
          ]
        },
        {
          id: 'time-place-02', title: '桌上的书',
          steps: [
            { en: 'on the desk', zh: '在书桌上' },
            { en: 'a book on the desk', zh: '书桌上的一本书' },
            { en: 'There is a book on the desk.', zh: '书桌上有一本书。', alternatives: ["There's a book on the desk."] }
          ]
        },
        {
          id: 'time-place-03', title: '图书馆隔壁',
          steps: [
            { en: 'next to the library', zh: '在图书馆旁边' },
            { en: 'The cafe is next to the library.', zh: '咖啡馆在图书馆旁边。' },
            { en: 'Let us meet at the cafe next to the library.', zh: '我们在图书馆旁边的咖啡馆见吧。', alternatives: ["Let's meet at the cafe next to the library."] }
          ]
        },
        {
          id: 'time-place-04', title: '傍晚散步',
          steps: [
            { en: 'in the park', zh: '在公园里' },
            { en: 'walk in the park', zh: '在公园里散步' },
            { en: 'We walk in the park after dinner.', zh: '我们晚饭后在公园里散步。' }
          ]
        },
        {
          id: 'time-place-05', title: '等公交车',
          steps: [
            { en: 'in ten minutes', zh: '十分钟后' },
            { en: 'The bus arrives soon.', zh: '公交车很快就到。' },
            { en: 'The bus arrives in ten minutes.', zh: '公交车十分钟后到。' }
          ]
        },
        {
          id: 'time-place-06', title: '今天与明天',
          steps: [
            { en: 'busy today', zh: '今天很忙' },
            { en: 'I am not free today.', zh: '我今天没空。', alternatives: ["I'm not free today."] },
            { en: 'I am not free today, but I am free tomorrow.', zh: '我今天没空，但明天有空。', alternatives: ["I'm not free today, but I'm free tomorrow."] }
          ]
        },
        {
          id: 'time-place-07', title: '在哪里见面',
          steps: [
            { en: 'this afternoon', zh: '今天下午' },
            { en: 'meet this afternoon', zh: '今天下午见面' },
            { en: 'Where can we meet this afternoon?', zh: '我们今天下午可以在哪里见面？' }
          ]
        },
        {
          id: 'time-place-08', title: '昨天去了哪里',
          steps: [
            { en: 'the bookstore near my school', zh: '我学校附近的书店' },
            { en: 'I went to the bookstore yesterday.', zh: '我昨天去了书店。' },
            { en: 'I went to the bookstore near my school yesterday.', zh: '我昨天去了学校附近的书店。' }
          ]
        }
      ]
    },
    {
      id: 'travel',
      title: '带着英语去旅行',
      level: 'A2',
      category: '旅行出行',
      description: '在车站、酒店、餐厅和旅途中，用完整句子解决真实的小问题。',
      units: [
        {
          id: 'travel-01', title: '买一张车票',
          steps: [
            { en: 'a ticket to the airport', zh: '一张去机场的票' },
            { en: 'I would like a ticket to the airport.', zh: '我想要一张去机场的票。', alternatives: ["I'd like a ticket to the airport."] },
            { en: 'I would like a ticket to the airport for tomorrow morning.', zh: '我想要一张明天早上去机场的票。', alternatives: ["I'd like a ticket to the airport for tomorrow morning."] }
          ]
        },
        {
          id: 'travel-02', title: '入住酒店',
          steps: [
            { en: 'a room for two nights', zh: '一间住两晚的客房' },
            { en: 'I booked a room for two nights.', zh: '我订了一间客房，住两晚。' },
            { en: 'I booked a room for two nights, and I would like to check in.', zh: '我订了一间住两晚的客房，现在想办理入住。', alternatives: ["I booked a room for two nights, and I'd like to check in."] }
          ]
        },
        {
          id: 'travel-03', title: '问路到车站',
          steps: [
            { en: 'the nearest station', zh: '最近的车站' },
            { en: 'get to the nearest station', zh: '到达最近的车站' },
            { en: 'Could you tell me how to get to the nearest station?', zh: '你能告诉我怎么去最近的车站吗？' }
          ]
        },
        {
          id: 'travel-04', title: '寻找行李',
          steps: [
            { en: 'a small blue suitcase', zh: '一个蓝色小行李箱' },
            { en: 'I cannot find my suitcase.', zh: '我找不到我的行李箱。', alternatives: ["I can't find my suitcase."] },
            { en: 'I cannot find my suitcase, which is small and blue.', zh: '我找不到我的行李箱了，它是蓝色的小箱子。', alternatives: ["I can't find my suitcase, which is small and blue."] }
          ]
        },
        {
          id: 'travel-05', title: '在餐厅点餐',
          steps: [
            { en: 'without onions', zh: '不加洋葱' },
            { en: 'a bowl of noodles without onions', zh: '一碗不加洋葱的面条' },
            { en: 'Could I have a bowl of noodles without onions, please?', zh: '请给我一碗不加洋葱的面条，可以吗？' }
          ]
        },
        {
          id: 'travel-06', title: '雨天的计划',
          steps: [
            { en: 'visit the museum', zh: '参观博物馆' },
            { en: 'It is going to rain tomorrow.', zh: '明天要下雨。', alternatives: ["It's going to rain tomorrow."] },
            { en: 'If it rains tomorrow, we will visit the museum.', zh: '如果明天下雨，我们就去参观博物馆。', alternatives: ["If it rains tomorrow, we'll visit the museum."] }
          ]
        },
        {
          id: 'travel-07', title: '错过了火车',
          steps: [
            { en: 'miss the last train', zh: '错过末班火车' },
            { en: 'We missed the last train.', zh: '我们错过了末班火车。' },
            { en: 'We missed the last train because we left the hotel too late.', zh: '我们因为离开酒店太晚，错过了末班火车。' }
          ]
        },
        {
          id: 'travel-08', title: '分享旅行经历',
          steps: [
            { en: 'travel by yourself', zh: '独自旅行', alternatives: ['travel alone'] },
            { en: 'Have you ever traveled by yourself?', zh: '你曾经独自旅行过吗？', alternatives: ['Have you ever travelled by yourself?', 'Have you ever traveled alone?', 'Have you ever travelled alone?'] },
            { en: 'Have you ever traveled by yourself to another country?', zh: '你曾经独自去另一个国家旅行过吗？', alternatives: ['Have you ever travelled by yourself to another country?', 'Have you ever traveled alone to another country?', 'Have you ever travelled alone to another country?'] }
          ]
        }
      ]
    },
    {
      id: 'study-work',
      title: '学习与工作中的沟通',
      level: 'A2',
      category: '学习工作',
      description: '练习学习习惯、任务安排和同事交流，掌握常用时态与请求表达。',
      units: [
        {
          id: 'study-work-01', title: '每天复习',
          steps: [
            { en: 'review new words', zh: '复习新单词' },
            { en: 'spend twenty minutes reviewing new words', zh: '花二十分钟复习新单词' },
            { en: 'I spend twenty minutes reviewing new words every evening.', zh: '我每天晚上花二十分钟复习新单词。' }
          ]
        },
        {
          id: 'study-work-02', title: '先完成作业',
          steps: [
            { en: 'finish my homework', zh: '完成我的作业' },
            { en: 'finish my homework before I watch a movie', zh: '在看电影之前完成我的作业' },
            { en: 'I need to finish my homework before I watch a movie.', zh: '我需要先完成作业，再看电影。' }
          ]
        },
        {
          id: 'study-work-03', title: '没听懂时提问',
          steps: [
            { en: 'explain this sentence', zh: '解释这个句子' },
            { en: 'explain this sentence again', zh: '再解释一遍这个句子' },
            { en: 'Could you explain this sentence again more slowly?', zh: '你能更慢一点，再解释一遍这个句子吗？' }
          ]
        },
        {
          id: 'study-work-04', title: '会议取消了',
          steps: [
            { en: 'the meeting this morning', zh: '今天上午的会议' },
            { en: 'The meeting was canceled.', zh: '会议取消了。', alternatives: ['The meeting was cancelled.'] },
            { en: 'The meeting this morning was canceled because our manager was sick.', zh: '今天上午的会议取消了，因为我们的经理生病了。', alternatives: ['The meeting this morning was cancelled because our manager was sick.'] }
          ]
        },
        {
          id: 'study-work-05', title: '安排交稿时间',
          steps: [
            { en: 'by Friday afternoon', zh: '不晚于周五下午' },
            { en: 'send me the report', zh: '把报告发给我' },
            { en: 'Can you send me the report by Friday afternoon?', zh: '你能在周五下午之前把报告发给我吗？' }
          ]
        },
        {
          id: 'study-work-06', title: '忘带笔记本',
          steps: [
            { en: 'bring my notebook', zh: '带上我的笔记本' },
            { en: 'I forgot to bring my notebook.', zh: '我忘了带笔记本。' },
            { en: 'I forgot to bring my notebook, so I took notes on my phone.', zh: '我忘了带笔记本，所以用手机记了笔记。' }
          ]
        },
        {
          id: 'study-work-07', title: '正在做的项目',
          steps: [
            { en: 'work on a new project', zh: '做一个新项目' },
            { en: 'We are working on a new project.', zh: '我们正在做一个新项目。', alternatives: ["We're working on a new project."] },
            { en: 'We are working on a new project that will help students learn English.', zh: '我们正在做一个帮助学生学习英语的新项目。', alternatives: ["We're working on a new project that will help students learn English."] }
          ]
        },
        {
          id: 'study-work-08', title: '考试前的计划',
          steps: [
            { en: 'study at the library', zh: '在图书馆学习' },
            { en: 'plan to study at the library this weekend', zh: '计划这个周末去图书馆学习' },
            { en: 'I plan to study at the library this weekend to prepare for the exam.', zh: '我计划这个周末去图书馆学习，为考试做准备。' }
          ]
        }
      ]
    },
    {
      id: 'opinions',
      title: '有条理地表达观点',
      level: 'B1',
      category: '观点交流',
      description: '通过理由、让步、比较和建议，练习把自己的想法说得更完整。',
      units: [
        {
          id: 'opinions-01', title: '阅读的价值',
          steps: [
            { en: 'understand other people', zh: '理解他人' },
            { en: 'Reading helps us understand other people.', zh: '阅读帮助我们理解他人。' },
            { en: 'I believe reading helps us understand people from different backgrounds.', zh: '我相信阅读能帮助我们理解有着不同背景的人。' }
          ]
        },
        {
          id: 'opinions-02', title: '同意与补充',
          steps: [
            { en: 'agree with your idea', zh: '赞同你的想法' },
            { en: 'I agree with your idea.', zh: '我赞同你的想法。' },
            { en: 'I agree with your idea, but we need more time to discuss the details.', zh: '我赞同你的想法，但我们需要更多时间讨论细节。' }
          ]
        },
        {
          id: 'opinions-03', title: '比较两种选择',
          steps: [
            { en: 'prefer walking to driving', zh: '比起开车更喜欢步行' },
            { en: 'I prefer walking to driving.', zh: '比起开车，我更喜欢步行。' },
            { en: 'I prefer walking to driving because it gives me time to relax.', zh: '比起开车，我更喜欢步行，因为这能给我放松的时间。' }
          ]
        },
        {
          id: 'opinions-04', title: '承认困难也坚持',
          steps: [
            { en: 'a little difficult', zh: '有一点困难' },
            { en: 'The course is a little difficult.', zh: '这门课程有一点难。' },
            { en: 'Although the course is a little difficult, I want to keep learning.', zh: '虽然这门课程有一点难，但我想继续学下去。' }
          ]
        },
        {
          id: 'opinions-05', title: '先听听别人的想法',
          steps: [
            { en: 'listen to different opinions', zh: '倾听不同的观点' },
            { en: 'It is important to listen to different opinions.', zh: '倾听不同的观点很重要。', alternatives: ["It's important to listen to different opinions."] },
            { en: 'It is important to listen to different opinions before making a decision.', zh: '在做决定之前，倾听不同的观点很重要。', alternatives: ["It's important to listen to different opinions before making a decision."] }
          ]
        },
        {
          id: 'opinions-06', title: '询问理由',
          steps: [
            { en: 'the best solution', zh: '最好的解决办法' },
            { en: 'You think this is the best solution.', zh: '你认为这是最好的解决办法。' },
            { en: 'Why do you think this is the best solution to the problem?', zh: '你为什么认为这是解决这个问题的最好办法？' }
          ]
        },
        {
          id: 'opinions-07', title: '用假设提出方案',
          steps: [
            { en: 'more bike lanes', zh: '更多自行车道' },
            { en: 'if the city had more bike lanes', zh: '如果这座城市有更多自行车道' },
            { en: 'If the city had more bike lanes, more people would cycle to work.', zh: '如果这座城市有更多自行车道，就会有更多人骑车上班。' }
          ]
        },
        {
          id: 'opinions-08', title: '提出温和的建议',
          steps: [
            { en: 'take a short break', zh: '短暂休息一下' },
            { en: 'I suggest taking a short break.', zh: '我建议短暂休息一下。' },
            { en: 'I suggest taking a short break so that we can return with fresh ideas.', zh: '我建议短暂休息一下，这样我们回来时就能有新的想法。' }
          ]
        }
      ]
    },
    {
      id: 'growth',
      title: '从个人成长到社会话题',
      level: 'B1',
      category: '成长与社会',
      description: '围绕科技、教育、环保与合作等常见考试话题，积累清晰实用的表达。',
      units: [
        {
          id: 'growth-01', title: '合理使用科技',
          steps: [
            { en: 'use technology wisely', zh: '明智地使用科技' },
            { en: 'Technology can make our lives easier.', zh: '科技可以让我们的生活更便利。' },
            { en: 'Technology can make our lives easier if we use it wisely.', zh: '如果我们明智地使用科技，它就能让生活更便利。' }
          ]
        },
        {
          id: 'growth-02', title: '学习不只在课堂',
          steps: [
            { en: 'outside the classroom', zh: '在课堂之外' },
            { en: 'Learning does not stop outside the classroom.', zh: '学习并不会在走出课堂后停止。', alternatives: ["Learning doesn't stop outside the classroom."] },
            { en: 'Learning does not stop outside the classroom because everyday experiences can teach us a lot.', zh: '学习并不会在走出课堂后停止，因为日常经历能教会我们很多。', alternatives: ["Learning doesn't stop outside the classroom because everyday experiences can teach us a lot."] }
          ]
        },
        {
          id: 'growth-03', title: '少一点一次性用品',
          steps: [
            { en: 'a reusable bottle', zh: '一个可重复使用的水瓶' },
            { en: 'carry a reusable bottle', zh: '随身带一个可重复使用的水瓶' },
            { en: 'We can reduce plastic waste by carrying a reusable bottle.', zh: '我们可以通过随身携带可重复使用的水瓶来减少塑料垃圾。' }
          ]
        },
        {
          id: 'growth-04', title: '照顾自己的身心',
          steps: [
            { en: 'stay healthy', zh: '保持健康' },
            { en: 'get enough sleep', zh: '保证充足的睡眠' },
            { en: 'Getting enough sleep is as important as regular exercise for staying healthy.', zh: '对于保持健康来说，保证充足睡眠和规律运动同样重要。' }
          ]
        },
        {
          id: 'growth-05', title: '认识不同文化',
          steps: [
            { en: 'learn about other cultures', zh: '了解其他文化' },
            { en: 'become more open to different ways of life', zh: '变得更加接纳不同的生活方式' },
            { en: 'When we learn about other cultures, we become more open to different ways of life.', zh: '当我们了解其他文化时，就会更加接纳不同的生活方式。' }
          ]
        },
        {
          id: 'growth-06', title: '参与社区志愿服务',
          steps: [
            { en: 'help people in the community', zh: '帮助社区里的人' },
            { en: 'Volunteering gives us a chance to help others.', zh: '志愿服务给了我们帮助他人的机会。' },
            { en: 'Volunteering gives us a chance to help people in the community and learn new skills.', zh: '志愿服务给了我们帮助社区居民并学习新技能的机会。' }
          ]
        },
        {
          id: 'growth-07', title: '共同解决问题',
          steps: [
            { en: 'share their skills', zh: '分享他们各自的技能' },
            { en: 'Team members share their skills.', zh: '团队成员分享各自的技能。' },
            { en: 'When team members share their skills, they can solve problems more effectively.', zh: '当团队成员分享各自的技能时，他们就能更有效地解决问题。' }
          ]
        },
        {
          id: 'growth-08', title: '从错误中进步',
          steps: [
            { en: 'learn from our mistakes', zh: '从我们的错误中学习' },
            { en: 'Making mistakes is part of learning.', zh: '犯错是学习的一部分。' },
            { en: 'Making mistakes is part of learning, and what matters is how we respond to them.', zh: '犯错是学习的一部分，重要的是我们如何应对这些错误。' }
          ]
        }
      ]
    },
    {
      id: 'quotes',
      title: '英语名句，跟着经典学表达',
      level: 'B2',
      category: '名句',
      description: '39 句英美文学与名人名言：读懂一句经典，记住一辈子的表达。单句成单元，打字背诵双语对照。',
      units: [
        {
          id: 'quote-01', title: 'F. Scott Fitzgerald《了不起的盖茨比》',
          steps: [
            { en: 'So we beat on, boats against the current, borne back ceaselessly into the past.', zh: '于是我们奋力前行，如逆水行舟，却不断被浪潮推回过去。' }
          ]
        },
        {
          id: 'quote-02', title: 'Charles Dickens《双城记》',
          steps: [
            { en: 'It was the best of times, it was the worst of times.', zh: '那是最美好的时代，也是最糟糕的时代。' }
          ]
        },
        {
          id: 'quote-03', title: 'Jane Austen《傲慢与偏见》',
          steps: [
            { en: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', zh: '凡是有钱的单身汉，总想娶位太太，这已经成了一条举世公认的真理。' }
          ]
        },
        {
          id: 'quote-04', title: 'Shakespeare《哈姆雷特》',
          steps: [
            { en: 'To be, or not to be, that is the question.', zh: '生存还是毁灭，这是一个问题。' }
          ]
        },
        {
          id: 'quote-05', title: 'Shakespeare《皆大欢喜》',
          steps: [
            { en: 'All the world\'s a stage, and all the men and women merely players.', zh: '全世界是一个舞台，所有的男男女女不过是一些演员。' }
          ]
        },
        {
          id: 'quote-06', title: 'Herman Melville《白鲸》',
          steps: [
            { en: 'Call me Ishmael.', zh: '叫我以实玛利吧。' }
          ]
        },
        {
          id: 'quote-07', title: 'Tolstoy《安娜·卡列尼娜》',
          steps: [
            { en: 'Happy families are all alike; every unhappy family is unhappy in its own way.', zh: '幸福的家庭都是相似的，不幸的家庭各有各的不幸。' }
          ]
        },
        {
          id: 'quote-08', title: 'George Orwell《一九八四》',
          steps: [
            { en: 'It was a bright cold day in April, and the clocks were striking thirteen.', zh: '四月间，天气寒冷晴朗，钟敲了十三下。' }
          ]
        },
        {
          id: 'quote-09', title: 'J.R.R. Tolkien《魔戒》',
          steps: [
            { en: 'Not all those who wander are lost.', zh: '并非所有流浪者都迷失了方向。' }
          ]
        },
        {
          id: 'quote-10', title: 'Franklin D. Roosevelt',
          steps: [
            { en: 'The only thing we have to fear is fear itself.', zh: '我们唯一需要恐惧的，就是恐惧本身。' }
          ]
        },
        {
          id: 'quote-11', title: 'Louisa May Alcott',
          steps: [
            { en: 'That is a good book which is opened with expectation and closed with profit.', zh: '好书让人满怀期待地翻开，又满载收获地合上。' }
          ]
        },
        {
          id: 'quote-12', title: 'George R. R. Martin',
          steps: [
            { en: 'A reader lives a thousand lives before he dies. The man who never reads lives only one.', zh: '读书的人在离世前已活过一千种人生；从不读书的人只活了一次。' }
          ]
        },
        {
          id: 'quote-13', title: 'J.R.R. Tolkien《魔戒二部曲》',
          steps: [
            { en: 'There is some good in this world, and it\'s worth fighting for.', zh: '这个世界上仍有美好，值得我们为之奋战。' }
          ]
        },
        {
          id: 'quote-14', title: 'J.K. Rowling',
          steps: [
            { en: 'It is our choices that show what we truly are, far more than our abilities.', zh: '决定我们真正是什么样人的，是我们的选择，而远非我们的能力。' }
          ]
        },
        {
          id: 'quote-15', title: 'F. Scott Fitzgerald《了不起的盖茨比》',
          steps: [
            { en: 'Whenever you feel like criticizing anyone, just remember that all the people in this world haven\'t had the advantages that you\'ve had.', zh: '每当你想批评别人时，要记住，这世上并不是所有人都有你拥有的那些优越条件。' }
          ]
        },
        {
          id: 'quote-16', title: 'Sylvia Plath《钟形罩》',
          steps: [
            { en: 'I took a deep breath and listened to the old brag of my heart: I am, I am, I am.', zh: '我深吸一口气，听着心脏那古老的呐喊：我在，我在，我在。' }
          ]
        },
        {
          id: 'quote-17', title: 'Oscar Wilde',
          steps: [
            { en: 'We are all in the gutter, but some of us are looking at the stars.', zh: '我们都身在阴沟，但仍有人仰望星空。' }
          ]
        },
        {
          id: 'quote-18', title: 'Mark Twain',
          steps: [
            { en: 'The man who does not read has no advantage over the man who cannot read.', zh: '不读书的人，比起不识字的人并没有任何优势。' }
          ]
        },
        {
          id: 'quote-19', title: 'J.K. Rowling',
          steps: [
            { en: 'It matters not what someone is born, but what they grow to be.', zh: '人的出身并不重要，重要的是他成长为什么样的人。' }
          ]
        },
        {
          id: 'quote-20', title: 'Harper Lee《杀死一只知更鸟》',
          steps: [
            { en: 'Real courage is when you know you\'re licked before you begin, but you begin anyway and see it through no matter what.', zh: '真正的勇气是：明知一开始就会输，却依然开始，并无论如何坚持到底。' }
          ]
        },
        {
          id: 'quote-21', title: 'Harper Lee《杀死一只知更鸟》',
          steps: [
            { en: 'You never really understand a person until you consider things from his point of view.', zh: '除非你站在对方的角度看问题，否则你永远无法真正了解一个人。' }
          ]
        },
        {
          id: 'quote-22', title: 'Marie Curie',
          steps: [
            { en: 'Nothing in life is to be feared, it is only to be understood.', zh: '生活中没有什么可怕的，只需要去理解。' }
          ]
        },
        {
          id: 'quote-23', title: 'Ernest Hemingway《永别了，武器》',
          steps: [
            { en: 'The world breaks everyone, and afterward, some are strong at the broken places.', zh: '这个世界会打击每一个人，但此后，有些人在破碎处变得更强壮。' }
          ]
        },
        {
          id: 'quote-24', title: 'Ernest Hemingway《老人与海》',
          steps: [
            { en: 'But man is not made for defeat. A man can be destroyed but not defeated.', zh: '但人不是为失败而生的。一个人可以被毁灭，但不能被打败。' }
          ]
        },
        {
          id: 'quote-25', title: 'John Lennon',
          steps: [
            { en: 'Life is what happens to you while you are busy making other plans.', zh: '生活就是在你忙着制定其他计划时，发生在你身上的事。' }
          ]
        },
        {
          id: 'quote-26', title: 'Robert Frost《未选择的路》',
          steps: [
            { en: 'Two roads diverged in a wood, and I took the one less traveled by, and that has made all the difference.', zh: '林中有两条岔路，而我选了人迹更少的一条，从此决定了一切。' }
          ]
        },
        {
          id: 'quote-27', title: 'Francis Bacon',
          steps: [
            { en: 'Hope is a good breakfast, but it is a bad supper.', zh: '希望是顿好早餐，却是顿糟糕的晚餐。' }
          ]
        },
        {
          id: 'quote-28', title: 'Stephen King《肖申克的救赎》',
          steps: [
            { en: 'Some birds aren\'t meant to be caged. Their feathers are just too bright.', zh: '有些鸟儿注定是关不住的，它们的每一片羽毛都闪耀着自由的光辉。' }
          ]
        },
        {
          id: 'quote-29', title: 'Stephen King《肖申克的救赎》',
          steps: [
            { en: 'Get busy living, or get busy dying.', zh: '要么忙着活，要么忙着死。' }
          ]
        },
        {
          id: 'quote-30', title: 'Margaret Mitchell《飘》',
          steps: [
            { en: 'After all, tomorrow is another day!', zh: '毕竟，明天又是新的一天！' }
          ]
        },
        {
          id: 'quote-31', title: 'Emily Brontë《呼啸山庄》',
          steps: [
            { en: 'Whatever our souls are made of, his and mine are the same.', zh: '无论我们的灵魂由什么构成，他的和我的都是同一种。' }
          ]
        },
        {
          id: 'quote-32', title: 'Henry David Thoreau《瓦尔登湖》',
          steps: [
            { en: 'If you have built castles in the air, your work need not be lost; that is where they should be. Now put the foundations under them.', zh: '如果你造了空中楼阁，你的劳动并不会白费：楼阁本该造在空中，现在要做的，是在它们下面打好地基。' }
          ]
        },
        {
          id: 'quote-33', title: 'Louisa May Alcott《小妇人》',
          steps: [
            { en: 'I am not afraid of storms, for I am learning how to sail my ship.', zh: '我不惧怕风暴，因为我正在学习如何驾驭我的船。' }
          ]
        },
        {
          id: 'quote-34', title: 'Audrey Hepburn',
          steps: [
            { en: 'Nothing is impossible; the word itself says \'I\'m possible\'!', zh: '没有什么是不可能的，“不可能”这个词本身就在说“我可能”！' }
          ]
        },
        {
          id: 'quote-35', title: 'Dylan Thomas',
          steps: [
            { en: 'Do not go gentle into that good night. Rage, rage against the dying of the light.', zh: '不要温和地走进那个良夜。怒斥吧，怒斥光明的消逝。' }
          ]
        },
        {
          id: 'quote-36', title: 'Albert Camus',
          steps: [
            { en: 'In the middle of winter, I at last discovered that there was in me an invincible summer.', zh: '在隆冬，我终于知道，我身上有一个不可战胜的夏天。' }
          ]
        },
        {
          id: 'quote-37', title: 'Walt Whitman',
          steps: [
            { en: 'Keep your face always toward the sunshine, and shadows will fall behind you.', zh: '永远面向阳光，阴影就会落在你身后。' }
          ]
        },
        {
          id: 'quote-38', title: 'Eleanor Roosevelt',
          steps: [
            { en: 'The future belongs to those who believe in the beauty of their dreams.', zh: '未来属于那些相信梦想之美的人。' }
          ]
        },
        {
          id: 'quote-39', title: 'Nelson Mandela',
          steps: [
            { en: 'It always seems impossible until it\'s done.', zh: '在做成之前，一切看上去都不可能。' }
          ]
        }
      ]
    }
  ];
})();
