#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 qwerty-learner（GPL-3.0）的常用词典搬进本站。

用法：
    python tools/build_qwerty_dicts.py            # 抓取（带磁盘缓存）+ 转换
    python tools/build_qwerty_dicts.py --refresh  # 忽略缓存重新抓取

产出：
    data/dicts/index.js      词典目录（很小，index.html 里静态引入）
    data/dicts/<id>.js       每本词典一份，按需 <script> 注入

数据格式（尽量紧凑，目标是把 12 本词典控制在几 MB 内）：
    window.TW.DECKS['<id>'] = [[word, us, uk, "释义行1\\n释义行2"], ...]
前端 TW.data.loadBook() 会把数组展开成与 TW.WORDS 同构的词对象。

来源与许可：
    https://github.com/RealKai42/qwerty-learner   （GPL-3.0）
    仅取 public/dicts/ 下的纯词表数据（单词 + 音标 + 中文释义）。
"""
import io
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache', 'qwerty')
OUTDIR = os.path.join(ROOT, 'data', 'dicts')
RAW_BASE = 'https://api.github.com/repos/RealKai42/qwerty-learner/contents/public/dicts/'

# id, 源文件, 显示名, 一句话说明, 分组
DECKS = [
    ('chuzhong',    'ChuZhongluan_2_T.json',          '初中词汇',        '初中英语必备词汇',             '中学词汇'),
    ('gk3500',      'GaoKao_3500.json',               '高考 3500',       '高中 / 高考核心词汇',          '中学词汇'),
    ('gaozhong',    'GaoZhongluan_2_T.json',          '高中词汇(新课标)', '新课标高中英语必备词汇',        '中学词汇'),
    ('cet4',        'CET4_T.json',                    '大学英语四级',     'CET-4 大纲词汇',              '考试核心'),
    ('cet6',        'CET6_T.json',                    '大学英语六级',     'CET-6 大纲词汇',              '考试核心'),
    ('kaoyan',      'KaoYan_3_T.json',                '考研英语',        '考研英语大纲词汇',             '考试核心'),
    ('tem4',        'Level4luan_2_T.json',            '英语专业四级',     'TEM-4 专业四级词汇',          '考试核心'),
    ('ielts',       'IELTS_3_T.json',                 '雅思 IELTS',      '雅思核心词汇',                '留学考试'),
    ('toefl',       'TOEFL_3_T.json',                 '托福 TOEFL',      '托福核心词汇',                '留学考试'),
    ('gre',         'GRE_3_T.json',                   'GRE',            'GRE 核心词汇',                '留学考试'),
    ('bec',         'BEC_3_T.json',                   '商务英语 BEC',     'BEC 商务英语词汇',            '职业英语'),
    ('oxford3000',  'Oxford3000.json',                '牛津核心词',       'Oxford 核心词表（上游仅收录 1339 词）', '通用权威'),
    ('longman3000', 'Longman_Communication_3000.json', '朗文交际 3000',    'Longman 口语交际 3000 词',    '通用权威'),
    ('nce2',        'NCE_2.json',                     '新概念英语 2',     '新概念英语第二册词汇',         '通用权威'),
]


def fetch(name, refresh=False):
    """抓单个词表 JSON（优先用本地缓存）。"""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if os.path.exists(path) and not refresh:
        with io.open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    url = RAW_BASE + name + '?ref=master'
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={
                'Accept': 'application/vnd.github.raw',
                'User-Agent': 'EnglishLearningWebsite-build',
            })
            with urllib.request.urlopen(req, timeout=180) as r:
                # 大文件偶发 IncompleteRead：按 Content-Length 逐块读，读满为止
                need = r.length
                buf = io.BytesIO()
                while True:
                    chunk = r.read(65536)
                    if not chunk:
                        break
                    buf.write(chunk)
                body = buf.getvalue()
            if need and len(body) != need:
                raise IOError('短读：%d / %d' % (len(body), need))
            json.loads(body.decode('utf-8'))      # 先校验，坏数据不落缓存
            with io.open(path, 'wb') as f:
                f.write(body)
            return json.loads(body.decode('utf-8'))
        except Exception as e:                     # noqa: BLE001
            last = e
            print('   ! %s 第 %d 次失败：%s' % (name, attempt + 1, e))
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError('抓取 %s 失败：%s' % (name, last))


def clean(s):
    """去掉多余空白与会影响行分隔的字符。"""
    if s is None:
        return ''
    return ' '.join(str(s).split())


def convert(rows):
    """qwerty 原始条目 -> 紧凑数组形式，并按小写单词去重。"""
    out = []
    seen = set()
    for it in rows:
        word = clean(it.get('name'))
        if not word:
            continue
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        trans = [clean(t) for t in (it.get('trans') or []) if clean(t)]
        out.append([word, clean(it.get('usphone')), clean(it.get('ukphone')), '\n'.join(trans)])
    return out


def main():
    refresh = '--refresh' in sys.argv
    os.makedirs(OUTDIR, exist_ok=True)
    meta = []
    total_bytes = 0
    total_words = 0
    t0 = time.time()

    for did, src, name, desc, group in DECKS:
        rows = fetch(src, refresh)
        words = convert(rows)
        arr = json.dumps(words, ensure_ascii=False, separators=(',', ':'))
        js = ('/* 自动生成，请勿手动修改；数据来源 qwerty-learner (GPL-3.0) —— %s\n'
              '   格式：[单词, 美音, 英音, 释义(\\n 分隔)] */\n'
              'window.TW=window.TW||{};window.TW.DECKS=window.TW.DECKS||{};\n'
              'window.TW.DECKS[%s]=%s;\n') % (src, json.dumps(did), arr)
        path = os.path.join(OUTDIR, did + '.js')
        with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(js)
        size = len(js.encode('utf-8'))
        total_bytes += size
        total_words += len(words)
        meta.append({'id': did, 'name': name, 'desc': desc, 'group': group,
                     'count': len(words), 'file': 'data/dicts/%s.js' % did})
        print('%-12s %-16s %6d 词  %7.0f KB   <- %s' % (did, name, len(words), size / 1024.0, src))

    idx = ('/* 自动生成，请勿手动修改；词典目录 */\n'
           'window.TW=window.TW||{};window.TW.DECKS_META=%s;\n'
           % json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
    with io.open(os.path.join(OUTDIR, 'index.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(idx)

    print('-' * 62)
    print('共 %d 本词典、%d 个词条，合计 %.1f MB，耗时 %.1fs'
          % (len(meta), total_words, total_bytes / 1048576.0, time.time() - t0))


if __name__ == '__main__':
    main()
