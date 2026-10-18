# -*- coding: utf-8 -*-
"""给 data/quotes.js 的名句补中文译文（zh 字段），并把名句课程追加进 data/sentences.js。
译文为自拟（名著通译多受版权保护，避免照抄）；脚本按顺序逐条对齐，数量不匹配即报错退出。
用法：python tools/add_quote_zh.py
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QJ = os.path.join(ROOT, 'data', 'quotes.js')
SJ = os.path.join(ROOT, 'data', 'sentences.js')

# 与 quotes 数组顺序一一对应的译文
ZH = [
    "于是我们奋力前行，如逆水行舟，却不断被浪潮推回过去。",
    "那是最美好的时代，也是最糟糕的时代。",
    "凡是有钱的单身汉，总想娶位太太，这已经成了一条举世公认的真理。",
    "生存还是毁灭，这是一个问题。",
    "全世界是一个舞台，所有的男男女女不过是一些演员。",
    "叫我以实玛利吧。",
    "幸福的家庭都是相似的，不幸的家庭各有各的不幸。",
    "四月间，天气寒冷晴朗，钟敲了十三下。",
    "并非所有流浪者都迷失了方向。",
    "我们唯一需要恐惧的，就是恐惧本身。",
    "好书让人满怀期待地翻开，又满载收获地合上。",
    "读书的人在离世前已活过一千种人生；从不读书的人只活了一次。",
    "这个世界上仍有美好，值得我们为之奋战。",
    "决定我们真正是什么样人的，是我们的选择，而远非我们的能力。",
    "每当你想批评别人时，要记住，这世上并不是所有人都有你拥有的那些优越条件。",
    "我深吸一口气，听着心脏那古老的呐喊：我在，我在，我在。",
    "我们都身在阴沟，但仍有人仰望星空。",
    "不读书的人，比起不识字的人并没有任何优势。",
    "人的出身并不重要，重要的是他成长为什么样的人。",
    "真正的勇气是：明知一开始就会输，却依然开始，并无论如何坚持到底。",
    "除非你站在对方的角度看问题，否则你永远无法真正了解一个人。",
    "生活中没有什么可怕的，只需要去理解。",
    "这个世界会打击每一个人，但此后，有些人在破碎处变得更强壮。",
    "但人不是为失败而生的。一个人可以被毁灭，但不能被打败。",
    "生活就是在你忙着制定其他计划时，发生在你身上的事。",
    "林中有两条岔路，而我选了人迹更少的一条，从此决定了一切。",
    "希望是顿好早餐，却是顿糟糕的晚餐。",
    "有些鸟儿注定是关不住的，它们的每一片羽毛都闪耀着自由的光辉。",
    "要么忙着活，要么忙着死。",
    "毕竟，明天又是新的一天！",
    "无论我们的灵魂由什么构成，他的和我的都是同一种。",
    "如果你造了空中楼阁，你的劳动并不会白费：楼阁本该造在空中，现在要做的，是在它们下面打好地基。",
    "我不惧怕风暴，因为我正在学习如何驾驭我的船。",
    "没有什么是不可能的，“不可能”这个词本身就在说“我可能”！",
    "不要温和地走进那个良夜。怒斥吧，怒斥光明的消逝。",
    "在隆冬，我终于知道，我身上有一个不可战胜的夏天。",
    "永远面向阳光，阴影就会落在你身后。",
    "未来属于那些相信梦想之美的人。",
    "在做成之前，一切看上去都不可能。",
]

# ---------- 1) quotes.js：给 quotes 数组逐条注入 zh ----------
src = io.open(QJ, encoding='utf-8').read()
head, rest = src.split('  quotes: [', 1)
arr, tail = rest.split('  ],', 1)          # quotes 数组体 / idioms 及其后

lines = arr.split('\n')
out, zi = [], 0
pat = re.compile(r'^(\s*\{ t: .*?)( \},?)$')
for ln in lines:
    m = pat.match(ln)
    if m:
        if zi >= len(ZH):
            print('译文数量少于名句数量'); sys.exit(1)
        out.append(m.group(1) + ', zh: "' + ZH[zi] + '" },' if m.group(2).endswith(',') else
                   m.group(1) + ', zh: "' + ZH[zi] + '" }')
        zi += 1
    else:
        out.append(ln)
if zi != len(ZH):
    print('名句 %d 条，译文 %d 条，数量不匹配' % (zi, len(ZH))); sys.exit(1)

head = head.replace('QUOTES.quotes: [{t: 英文句子, s: 出处}]',
                    'QUOTES.quotes: [{t: 英文句子, s: 出处, zh: 中文译文（自拟，避免照抄受版权保护的通译）}]')
io.open(QJ, 'w', encoding='utf-8', newline='\n').write(head + '  quotes: [' + '\n'.join(out) + '  ],' + tail)
print('quotes.js 注入 zh x', zi)

# ---------- 2) sentences.js：追加「名句课程」 ----------
s_src = io.open(SJ, encoding='utf-8').read()
if "id: 'quotes'" in s_src:
    print('名句课程已存在，跳过'); sys.exit(0)

# 从注入后的 quotes.js 里提取 (t, s, zh)
body = io.open(QJ, encoding='utf-8').read().split('  quotes: [', 1)[1].split('  ],', 1)[0]
entries = re.findall(r'\{ t: "(.*?)", s: "(.*?)", zh: "(.*?)" \}', body)
assert len(entries) == len(ZH), '提取数量不符'

units = []
for i, (t, s, zh) in enumerate(entries, 1):
    units.append(
        '        {\n'
        "          id: 'quote-%02d', title: '%s',\n"
        "          steps: [\n"
        "            { en: '%s', zh: '%s' }\n"
        '          ]\n'
        '        }' % (i, s.replace("'", "\\'"), t.replace("'", "\\'"), zh.replace("'", "\\'"))
    )
course = (
    "    {\n"
    "      id: 'quotes',\n"
    "      title: '英语名句，跟着经典学表达',\n"
    "      level: 'B2',\n"
    "      category: '名句',\n"
    "      description: '39 句英美文学与名人名言：读懂一句经典，记住一辈子的表达。单句成单元，打字背诵双语对照。',\n"
    "      units: [\n"
    + ',\n'.join(units) + '\n'
    "      ]\n"
    "    }"
)
marker = '  ];\n})();'
assert marker in s_src, 'sentences.js 结尾结构变了'
# 前一门课的 "    }" 后补逗号，再接名句课程
s_src = s_src.replace(marker, ',\n' + course + '\n  ];\n})();', 1)
io.open(SJ, 'w', encoding='utf-8', newline='\n').write(s_src)
print('sentences.js 追加名句课程，单元数', len(units))
