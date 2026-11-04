/* 听力板块题库：新闻 / 长对话 / 讲座（六级题型）
   ------------------------------------------------------------------
   sunfleeting 2026-11-05：「我们没看到听力题目，也没看到你导入了 BBC 的听力」。

   做法说明（重要）：
   · 音频不是 mp3，而是用浏览器自带语音（speechSynthesis）朗读 transcript ——
     这样零依赖、离线可用、不涉及任何音频版权；语速和逐句重播都能控制。
     想要真人录音，后续把 mp3 放进 audio/ 并给 segment 加 file 字段即可（视图已留口）。
   · 每一段都带 transcript（原文）、translation（译文）、explanation（每题解析），
     所以「听不懂」的时候能立刻对照，这也是本站在阅读板块的做法。
   · 题型对齐六级：Section A 长对话（一男一女交替）、Section B 听力篇章（新闻/说明文）、
     Section C 讲座讲话（学术口吻）。
*/
window.TW_LISTENING = {
  "updated": "2026-11-05",
  "sets": [
    {
      "id": "ls-news-tech",
      "title": "科技新闻三则",
      "kind": "news",
      "kindName": "新闻报道",
      "topic": "科技 · 就业",
      "source": "按 BBC News 风格编写（模拟）",
      "minutes": 6,
      "intro": "三段短新闻，每段两题。第一遍只听大意，第二遍再抓细节。",
      "segments": [
        {
          "id": "s1",
          "label": "News Item 1",
          "transcript": [
            "One of Britain's largest employers says it will stop asking candidates for their exam results when they apply for jobs. The company, which runs a chain of supermarkets, said the change would open up opportunities for people who did not do well at school. Its head of recruitment argued that a candidate's ability to deal with customers mattered far more than a grade in mathematics. Instead of exam certificates, applicants will now sit a short practical test and take part in a group discussion. Unions welcomed the move but warned that without proper training, new staff could be left to struggle. The company says it will fund a twelve-week training programme for every new recruit."
          ],
          "translation": "英国最大的雇主之一表示，招聘时不再要求应聘者提供考试成绩。这家经营连锁超市的公司称，这一改变会为在校成绩不佳的人打开机会。其招聘主管认为，应聘者接待顾客的能力远比数学成绩重要。应聘者不再提交考试证书，而要做一次简短的实操测试并参加小组讨论。工会欢迎此举，但警告说如果没有适当培训，新员工可能会难以胜任。公司表示将为每位新员工出资提供为期十二周的培训。",
          "questions": [
            {
              "n": 1,
              "stem": "What change will the company make in its recruitment?",
              "options": [
                { "k": "A", "t": "It will hire only candidates with good exam results." },
                { "k": "B", "t": "It will no longer ask for candidates' exam results." },
                { "k": "C", "t": "It will shorten the training programme for new staff." },
                { "k": "D", "t": "It will recruit mainly from local schools." }
              ],
              "answer": "B",
              "explain": "首句直接给出：it will stop asking candidates for their exam results。stop asking = no longer ask，B 为同义转述。A 与原文相反；C、D 未提及（培训是「提供」而非缩短）。"
            },
            {
              "n": 2,
              "stem": "What did unions warn about?",
              "options": [
                { "k": "A", "t": "New staff might lack proper training." },
                { "k": "B", "t": "The practical test might be unfair." },
                { "k": "C", "t": "The company might close some stores." },
                { "k": "D", "t": "Recruits might be paid less than before." }
              ],
              "answer": "A",
              "explain": "Unions welcomed the move but warned that without proper training, new staff could be left to struggle。题干 warn about 对应 without proper training 这一条件，A 正确。"
            }
          ]
        },
        {
          "id": "s2",
          "label": "News Item 2",
          "transcript": [
            "A team of engineers in Sweden has developed a battery that can be recharged in just under ten minutes. The battery is designed for electric cars, and its makers say it could remove one of the main reasons drivers hesitate to buy them. Most current models need between thirty minutes and several hours to charge. The new design uses a thin layer of a common metal instead of the costly materials found in conventional batteries, which also brings down the price. However, the team admits that the battery loses about one fifth of its capacity after eight hundred full charging cycles, so it may not last as long as those already on the market."
          ],
          "translation": "瑞典的一个工程师团队研发出一种不到十分钟即可充满的电池。这种电池为电动汽车设计，制造商称它能消除司机不愿购买电动车的主要原因之一。目前多数车型需要三十分钟到数小时才能充满。新设计用一层普通金属替代了传统电池中的昂贵材料，这也降低了成本。不过团队承认，在八百次完整充放电后电池会损失约五分之一容量，因此它的寿命可能不如市面上的现有电池。",
          "questions": [
            {
              "n": 3,
              "stem": "What is the main advantage of the new battery?",
              "options": [
                { "k": "A", "t": "It can be charged in under ten minutes." },
                { "k": "B", "t": "It can run for eight hundred kilometres." },
                { "k": "C", "t": "It is made entirely of recycled metal." },
                { "k": "D", "t": "It works better in cold weather." }
              ],
              "answer": "A",
              "explain": "首句 recharged in just under ten minutes 就是核心卖点，A 原词复现。B 把「八百次循环」误当成里程；C 原文只说「一层普通金属」，不是「全部回收金属」；D 未提及。"
            },
            {
              "n": 4,
              "stem": "What problem does the team admit?",
              "options": [
                { "k": "A", "t": "The battery is too expensive to produce." },
                { "k": "B", "t": "The battery's capacity drops after repeated use." },
                { "k": "C", "t": "The battery cannot be used in small cars." },
                { "k": "D", "t": "The charging equipment is hard to install." }
              ],
              "answer": "B",
              "explain": "however 后面是转折考点：loses about one fifth of its capacity after eight hundred full charging cycles = 反复使用后容量下降，B 正确。A 与「降低成本」相反。"
            }
          ]
        },
        {
          "id": "s3",
          "label": "News Item 3",
          "transcript": [
            "Astronomers say the amount of junk circling the Earth has reached a level that threatens working satellites. More than thirty thousand pieces larger than a tennis ball are now tracked, and each of them travels at about seven kilometres per second. At that speed even a small fragment can damage a spacecraft. Several companies are testing ways to remove the largest pieces, including a spacecraft fitted with a net and a harpoon. Critics point out that removing one object costs millions of dollars, while thousands of new pieces are created every year."
          ],
          "translation": "天文学家称，绕地球运行的太空垃圾已达威胁在用卫星的程度。目前被追踪的、直径大于网球的碎片超过三万块，每块飞行速度约每秒七公里。以这样的速度，即使很小的碎片也能损坏航天器。多家公司正在测试清除最大碎片的方法，包括一艘装有网和鱼叉的航天器。批评者指出，清除一块碎片要花数百万美元，而每年新增的碎片有数千块。",
          "questions": [
            {
              "n": 5,
              "stem": "Why is space junk considered dangerous?",
              "options": [
                { "k": "A", "t": "It blocks the view of telescopes on Earth." },
                { "k": "B", "t": "It travels fast enough to damage spacecraft." },
                { "k": "C", "t": "It changes the orbit of the moon." },
                { "k": "D", "t": "It interferes with radio signals." }
              ],
              "answer": "B",
              "explain": "seven kilometres per second + At that speed even a small fragment can damage a spacecraft，速度与危害之间的因果是考点，B 正确。A、C、D 均为未提及的干扰项。"
            },
            {
              "n": 6,
              "stem": "What do critics say about removing space junk?",
              "options": [
                { "k": "A", "t": "It is far too costly for the benefit it brings." },
                { "k": "B", "t": "It should be done by governments rather than companies." },
                { "k": "C", "t": "It may create even more dangerous fragments." },
                { "k": "D", "t": "It requires international cooperation first." }
              ],
              "answer": "A",
              "explain": "critics 之后是观点句：removing one object costs millions of dollars, while thousands of new pieces are created every year——花大钱只清一块，因此 A「代价太高、收益不成比例」正确。"
            }
          ]
        }
      ]
    },
    {
      "id": "ls-conv",
      "title": "长对话：实习与选课",
      "kind": "conv",
      "kindName": "长对话",
      "topic": "校园 · 职业",
      "source": "按六级 Section A 编写（模拟）",
      "minutes": 5,
      "intro": "一男一女交替，四个问题按对话顺序出现——考点通常是「谁说了什么」和「最后决定」。",
      "segments": [
        {
          "id": "s1",
          "label": "Conversation",
          "transcript": [
            "W: Have you decided what to do about the summer internship? The applications close on Friday.",
            "M: I know, but it clashes with the statistics course I wanted to take. If I do the internship, I can't attend the lectures.",
            "W: Can't you take the course in the autumn? Most second-year students do it then anyway.",
            "M: The autumn one is taught by a different professor, and the exam is much harder. I've heard half the class failed last year.",
            "W: That's a rumour. I took it last autumn and it wasn't that bad. The secret is doing the problem sets every week instead of the night before.",
            "M: Still, an internship at that company would look good on my CV. They said they might keep on two of the interns.",
            "W: Then do the internship and take the course in the spring. You've got three more semesters before you graduate — there's no rush.",
            "M: That's true. But my father keeps asking when I'm going to start earning money.",
            "W: You can tell him the internship pays a small salary. That usually ends the conversation.",
            "M: All right. I'll send the application tonight and register for the spring course tomorrow morning."
          ],
          "translation": "女：你决定暑期实习的事了吗？申请周五截止。男：我知道，可它和我很想上的统计学课冲突。如果去实习，就没法听课。女：你不能秋季再修吗？多数大二学生本来就是那时修的。男：秋季那门是另一个教授上，考试难得多。听说去年一半人没过。女：那是谣言。我去年秋季就修了，没那么难。诀窍是每周做习题，而不是头天晚上突击。男：不过在那家公司实习简历上好看。他们说可能会留用两名实习生。女：那就去实习，春季再修课。你毕业前还有三个学期，不用急。男：这倒是。可我爸老问我什么时候开始挣钱。女：你可以告诉他实习有少量工资，通常这话一出就聊完了。男：行。我今晚把申请发出去，明早登记春季课程。",
          "questions": [
            {
              "n": 1,
              "stem": "What is the man's problem?",
              "options": [
                { "k": "A", "t": "He cannot afford the tuition for the summer course." },
                { "k": "B", "t": "His internship clashes with a course he wants to take." },
                { "k": "C", "t": "He has missed the deadline for the internship." },
                { "k": "D", "t": "He failed the statistics course last year." }
              ],
              "answer": "B",
              "explain": "男士第一轮回答点明矛盾：it clashes with the statistics course I wanted to take，B 直接对应。C 错在截止日是周五、还没到；D 是「听说一半人没过」，不是他自己。"
            },
            {
              "n": 2,
              "stem": "Why does the man hesitate to take the course in the autumn?",
              "options": [
                { "k": "A", "t": "The professor is known to be strict and the exam is harder." },
                { "k": "B", "t": "The course is not offered in the autumn." },
                { "k": "C", "t": "He would have to pay extra fees." },
                { "k": "D", "t": "It would take up too much of his time." }
              ],
              "answer": "A",
              "explain": "男士说 the autumn one is taught by a different professor, and the exam is much harder. 选项 A 把两句合并，是标准同义转述。"
            },
            {
              "n": 3,
              "stem": "What does the woman say is the secret to passing the course?",
              "options": [
                { "k": "A", "t": "Attending every lecture." },
                { "k": "B", "t": "Getting hold of last year's exam papers." },
                { "k": "C", "t": "Doing the problem sets every week." },
                { "k": "D", "t": "Studying together with classmates." }
              ],
              "answer": "C",
              "explain": "The secret is doing the problem sets every week instead of the night before，C 原词复现。注意她同时否定了「去年一半人没过」这条谣言。"
            },
            {
              "n": 4,
              "stem": "What will the man do tonight?",
              "options": [
                { "k": "A", "t": "Register for the spring course." },
                { "k": "B", "t": "Talk to his father about the salary." },
                { "k": "C", "t": "Send in the internship application." },
                { "k": "D", "t": "Meet the professor of the statistics course." }
              ],
              "answer": "C",
              "explain": "末句：I'll send the application tonight and register for the spring course tomorrow morning。今晚发申请、明早登记课程，所以 A 的时间不对，C 正确。"
            }
          ]
        }
      ]
    },
    {
      "id": "ls-lecture",
      "title": "讲座两篇：睡眠与记忆 / 城市蜜蜂",
      "kind": "lecture",
      "kindName": "讲座讲话",
      "topic": "科普 · 生物",
      "source": "按六级 Section C 编写（模拟）",
      "minutes": 8,
      "intro": "学术口吻，句子更长。先抓「研究结论」，再听「为什么」和「但是」。",
      "segments": [
        {
          "id": "s1",
          "label": "Lecture 1",
          "transcript": [
            "Today I want to talk about what happens to memory while we sleep. For a long time, sleep was treated as a passive state — the brain simply switched off. That view changed in the 1990s, when researchers began recording the activity of single cells in sleeping rats. What they found was striking. Patterns of activity that had appeared while the animals learned a maze were replayed during sleep, in the same order and at high speed.",
            "Since then, the same replay has been observed in humans. In one well-known experiment, students who slept after studying a list of words remembered about twenty percent more than those who stayed awake for the same period. The gain was largest for the words that were hardest to learn, which suggests that sleep does not simply protect memories but actively reorganises them.",
            "There is, however, an important qualification. The benefit depends on deep sleep, which is concentrated in the first half of the night. Students who stay up late and then sleep from four in the morning until noon get plenty of hours but little of the sleep that matters. So if you have an exam, going to bed early is worth more than getting up early."
          ],
          "translation": "今天我要讲睡眠时记忆发生了什么。很长一段时间里，睡眠被视为被动状态——大脑只是关机了。这一看法在 1990 年代改变，研究者开始记录睡眠大鼠单个细胞的活动。他们的发现令人震惊：动物学走迷宫时出现的活动模式，在睡眠中以同样的顺序、以高速重放。此后，同样的重放在人身上也被观察到。在一项著名实验中，背完单词表后睡觉的学生，比同期保持清醒的学生多记住约百分之二十。收获最大的是最难记的词，这说明睡眠不只是保护记忆，而是主动重组记忆。不过有一个重要限定：这种收益取决于深睡，而深睡集中在前半夜。熬到凌晨四点再睡到中午的学生睡够了时长，却很少得到真正重要的那段睡眠。所以如果有考试，早睡比早起更有价值。",
          "questions": [
            {
              "n": 1,
              "stem": "What changed the traditional view of sleep?",
              "options": [
                { "k": "A", "t": "The discovery that the brain replays learning patterns during sleep." },
                { "k": "B", "t": "The invention of machines that measure brain temperature." },
                { "k": "C", "t": "The finding that sleep reduces the need for food." },
                { "k": "D", "t": "The observation that animals sleep less than humans." }
              ],
              "answer": "A",
              "explain": "That view changed in the 1990s, when researchers... 后面紧跟的就是发现：patterns were replayed during sleep。B、C、D 都是未提及的science 干扰项。"
            },
            {
              "n": 2,
              "stem": "What does the experiment with students suggest about sleep?",
              "options": [
                { "k": "A", "t": "It mainly protects memories from being forgotten." },
                { "k": "B", "t": "It actively reorganises what has been learned." },
                { "k": "C", "t": "It works better for easy material than for hard material." },
                { "k": "D", "t": "It has little effect on short-term memory." }
              ],
              "answer": "B",
              "explain": "关键句：sleep does not simply protect memories but actively reorganises them。C 恰好说反——gain 最大的是最难的词。"
            },
            {
              "n": 3,
              "stem": "What does the speaker advise students to do before an exam?",
              "options": [
                { "k": "A", "t": "Sleep as many hours as possible, whenever they can." },
                { "k": "B", "t": "Go to bed early rather than get up early." },
                { "k": "C", "t": "Study only in the first half of the night." },
                { "k": "D", "t": "Take short naps during the day." }
              ],
              "answer": "B",
              "explain": "末句 going to bed early is worth more than getting up early，B 是同义转述。A 被「睡够时长但没深睡」直接否掉，这是本篇最容易错的点。"
            }
          ]
        },
        {
          "id": "s2",
          "label": "Lecture 2",
          "transcript": [
            "Cities are often described as hostile to wildlife, yet some species are thriving in them. Take bees. A study of gardens in seventeen British cities found more bee species in urban gardens than in nearby farmland. The reason is not that cities are cleaner, but that they are warmer and more varied. A city garden typically contains dozens of different flowers, while a field of wheat offers a single crop for a few weeks a year.",
            "The finding has changed how planners think about green space. Instead of mowing every patch of grass, several cities now leave strips uncut through the summer, and plant flowers that bloom at different times. The results have been measured: in one project, the number of bee species rose from twelve to thirty-five in five years.",
            "But there is a catch. Not all bees benefit. The species that do well are mostly generalists able to feed on many plants. Specialised species, which depend on one or two plants, continue to decline. Urban gardens, in other words, are a refuge for some and a trap for others."
          ],
          "translation": "城市常被形容为对野生动物不友好，但有些物种在城市里反而兴盛。以蜜蜂为例。一项针对英国十七个城市花园的研究发现，城市花园里的蜂种比附近农田还多。原因不是城市更干净，而是更温暖、更多样。城市花园通常有几十种花，而一块麦田一年只有几周提供单一作物。这一发现改变了规划者对绿地的看法。若干城市不再割光每块草地，而是整个夏天留出不修剪的条带，并种下花期不同的花。结果是可以量化的：在一个项目里，蜂种数五年间从十二种升到三十五种。但有个陷阱：并非所有蜜蜂都受益。表现好的多是什么都吃的泛化种；依赖一两种植物的专化种仍在减少。换句话说，城市花园对一部分物种是庇护所，对另一部分则是陷阱。",
          "questions": [
            {
              "n": 4,
              "stem": "Why do urban gardens support more bee species than farmland?",
              "options": [
                { "k": "A", "t": "They are less polluted than farmland." },
                { "k": "B", "t": "They offer a greater variety of flowers over a longer period." },
                { "k": "C", "t": "They are protected from strong winds." },
                { "k": "D", "t": "They contain fewer competing insects." }
              ],
              "answer": "B",
              "explain": "The reason is not that cities are cleaner, but that they are warmer and more varied —— 先排除 A，再给出「更多样 + 花期更长」两条，B 正确。"
            },
            {
              "n": 5,
              "stem": "What have several cities started doing?",
              "options": [
                { "k": "A", "t": "Planting a single type of flower in every park." },
                { "k": "B", "t": "Leaving strips of grass uncut in summer." },
                { "k": "C", "t": "Building more beehives on rooftops." },
                { "k": "D", "t": "Moving gardens away from city centres." }
              ],
              "answer": "B",
              "explain": "Instead of mowing every patch of grass, several cities now leave strips uncut through the summer，B 原词复现。"
            },
            {
              "n": 6,
              "stem": "What is the limitation mentioned at the end?",
              "options": [
                { "k": "A", "t": "Only common species benefit from urban gardens." },
                { "k": "B", "t": "Urban gardens attract too many pests." },
                { "k": "C", "t": "The number of bees has fallen in recent years." },
                { "k": "D", "t": "City flowers are less nutritious than wild ones." }
              ],
              "answer": "A",
              "explain": "转折 But there is a catch 之后：species that do well are mostly generalists... specialised species continue to decline ⇒ 只有「泛化种」受益，A 正确（specialised 是反例）。"
            }
          ]
        }
      ]
    }
  ]
};
