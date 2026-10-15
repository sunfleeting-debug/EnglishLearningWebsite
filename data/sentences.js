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
    }
  ];
})();
