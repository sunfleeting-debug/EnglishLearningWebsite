import unittest
from build_scanned_paper_notes import parse_cloze, parse_matching, parse_reading, parse_single_column_listening, extract_translation, reading_translation, extract_reference_translation, column_lines, parse_column_explanations, extract_2026_translations, parse_2026_explanations, lines_2026


class ScannedNotesTests(unittest.TestCase):
    def test_cloze_checks_the_answer_and_keeps_reasoning(self):
        lines = ['26.A)apple（n.苹果）', '语法判断', '空格需要一个名词。', '语义判断',
                 '此处描述苹果，apple符合语境。', '27.B)bad', '语法判断', '下一题解析。']
        out = parse_cloze(lines, {26: ('A', 'apple'), 27: ('C', 'cake')})
        self.assertIn('空格需要一个名词', out[26])
        self.assertNotIn(27, out)
        self.assertNotIn('下一题', out[26])

    def test_matching_checks_the_letter_and_stops_at_next_question(self):
        lines = ['36.题干译文：描述内容', '答案解析C。由题干关键信息定位到C段。',
                 '该段说明了有关情况，因此题干里的关键词与该段原文表达的是相同的意思，故题干是同义转述。',
                 '37.题干译文：其他内容', '答案解析B。由题干定位到B段。']
        out = parse_matching(lines, {36: 'C', 37: 'A'})
        self.assertIn('定位到C段', out[36])
        self.assertNotIn(37, out)
        self.assertNotIn('其他内容', out[36])

    def test_matching_accepts_recognized_variant_of_the_analysis_label(self):
        lines = ['36.题干译文：描述内容', '答案解C。由题干关键信息定位到C段。',
                 '该段说明有关情况，结合上下文可以知道题干与原文一致。', '37.下一题']
        self.assertIn('定位到C段', parse_matching(lines, {36: 'C'})[36])

    def test_translation_stops_at_the_answer_section(self):
        lines = ['·全文翻译·', '一段文章内容。', '六级2024.6', '另一段内容。', '·答案详解·', '26.A)答案']
        self.assertEqual(extract_translation(lines, 0), '一段文章内容。另一段内容。')

    def test_reading_translation_can_end_on_the_same_page(self):
        def item(y, text):
            return {'box': [[10, y]], 'text': text, 'confidence': .99}
        page = {'page': 1, 'width': 100, 'height': 1000, 'items': [
            item(10, '全文翻译'), item(20, '文章内容。' * 65), item(200, '答案详解'),
            item(210, '不应包含的答案内容。')]}
        result = reading_translation([page], 1)
        self.assertEqual(result, '文章内容。' * 65)

    def test_fragmented_lines_stay_in_left_to_right_order(self):
        def item(x, y, text):
            return {'box': [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]],
                    'text': text, 'confidence': .99}
        page = {'page': 1, 'width': 100, 'height': 1000, 'items': [
            item(10, 10, '全文翻译'), item(60, 19, '后半句。'),
            item(10, 20, '文章内容。' * 65), item(10, 200, '答案详解')]}
        result = reading_translation([page], 1)
        self.assertTrue(result.startswith('文章内容。'))
        self.assertTrue(result.endswith('后半句。'))

    def test_reading_reasoning_must_match_question_and_answer(self):
        lines = ['46.问题', 'A)甲', 'B)乙', 'C)丙', 'D)丁',
                 '定位至文章第一段。文章指出相关细节，结合题干可知选项B为正确答案，其他选项与原文不符。',
                 '47.下一题']
        self.assertIn('文章第一段', parse_reading(lines, {46: 'B'})[46])
        self.assertNotIn(46, parse_reading(lines, {46: 'A'}))

    def test_reading_accepts_explicit_paraphrase_reason(self):
        lines = ['51.问题', 'A)甲', 'B)乙', 'C)丙', 'D)丁',
                 '文章说明了这个现象的真正原因与研究结论。选项D与此表述一致，故为正确答案。其他选项均不符。',
                 '52.下一题']
        self.assertIn('研究结论', parse_reading(lines, {51: 'D'})[51])

    def test_reading_drops_a_missing_middle_sentence(self):
        lines = ['52.问题', 'A)甲', 'B)乙', 'C)丙', 'D)丁',
                 '根据题干信息定位至第三段。才能平复情绪。选项B是对这一核心问题的直接概括，故为正确答案。', '53.下一题']
        self.assertNotIn(52, parse_reading(lines, {52: 'B'}))

    def test_reference_translation_removes_page_headers(self):
        lines = ['参考译文', '文章的第一段。', '第10页，共15页', '这里是下一段。', 'Section B']
        self.assertEqual(extract_reference_translation(lines, 0, 0), '文章的第一段。这里是下一段。')

    def test_incomplete_matching_translation_is_not_used(self):
        lines = ['参考译文', 'A）第一段完整。', 'B）第二段尚未完成', 'Section C']
        self.assertIsNone(extract_reference_translation(lines, 0, 1))

    def test_columns_are_read_separately_and_answers_are_checked(self):
        def item(x, y, text):
            return {'box': [[x, y], [x+10, y], [x+10, y+8], [x, y+8]], 'text': text, 'confidence': .99}
        pages = [{'page': 1, 'width': 1000, 'height': 1000, 'items': [
            item(50, 10, '36.【定位】关键词定位到G段。'),
            item(600, 11, '37.【定位】关键词定位到B段。'),
            item(50, 30, 'G）【精析】该段明确说明了事情的来龙去脉。'),
            item(600, 31, 'B）【精析】该段说明其他观点。'),
            item(50, 50, '因此题干与G段的意思完全一致，故答案为G）。')]}]
        lines = column_lines(pages)
        self.assertLess(lines.index('G）【精析】该段明确说明了事情的来龙去脉。'), lines.index('37.【定位】关键词定位到B段。'))
        result = parse_column_explanations(lines, {36: 'G', 37: 'A'}, 'match')
        self.assertIn('来龙去脉', result[36])
        self.assertNotIn(37, result)

    def test_listening_explanation_is_matched_to_the_recording_question(self):
        lines = ['1. What happened?', 'A）【精析】细节辨认题。对话中女士清楚说明原因，',
                 '由此可知说话者的实际意思，故答案为A）。', '2. Next question']
        self.assertIn('女士清楚说明原因', parse_column_explanations(lines, {1: 'A'}, 'listening')[1])
        self.assertNotIn(1, parse_column_explanations(lines, {1: 'B'}, 'listening'))

    def test_single_column_listening_requires_a_complete_verified_rationale(self):
        lines = ['1. What happened?', 'A)甲', 'C)丙', 'B)乙', 'D)丁',
                 '解析女士说出了原因，说明这个选项与录音中所说的事实一致。由此可知，B项与对话内容相符。',
                 '2. Next question']
        self.assertIn('女士说出', parse_single_column_listening(lines, {1: 'B'})[1])
        self.assertNotIn(1, parse_single_column_listening(lines, {1: 'A'}))

    def test_2026_translation_ignores_page_footer(self):
        def item(y, text):
            return {'box': [[10, y], [100, y], [100, y + 8], [10, y + 8]], 'text': text, 'confidence': 1.0}
        pages = [{'page': 1, 'width': 1000, 'height': 1000, 'items': [
            item(10, '全文翻译'), item(20, '文章内容。' * 65),
            item(940, '2026年6月考试真题答案详解（共3套）')]},
            {'page': 2, 'width': 1000, 'height': 1000, 'items': [
                item(10, '结尾内容。'), item(20, '核心词汇')]}]
        result = extract_2026_translations(pages)
        self.assertEqual(result[0], '文章内容。' * 65 + '结尾内容。')

    def test_2026_translation_keeps_text_just_above_footer(self):
        def item(y, text):
            return {'box': [[10, y], [100, y], [100, y + 8], [10, y + 8]], 'text': text, 'confidence': 1.0}
        pages = [{'page': 1, 'width': 1000, 'height': 1000, 'items': [
            item(10, '全文翻译'), item(20, '文章内容。' * 65), item(920, '跨页前的最后一句，'),
            item(950, '2026 年6 月大学英语六级考试真题答案详解(共3 套)')]},
            {'page': 2, 'width': 1000, 'height': 1000, 'items': [item(10, '跨页后的续句。'), item(20, '核心词汇')]}]
        result = extract_2026_translations(pages)
        self.assertIn('跨页前的最后一句，跨页后的续句。', result[0])

    def test_2026_rationale_checks_recorded_answer(self):
        lines = ['46.题目', 'A)甲', 'B)乙', '答案为B）。',
                 '文章第二段说明了问题发生的原因，并提供了具体事实，所以B项是对原文的概括，符合题目的意思。',
                 '干扰项排除', '其他选项不对。', '47.下一题']
        self.assertIn('第二段', parse_2026_explanations(lines, {46: 'B'})[46])
        self.assertNotIn(46, parse_2026_explanations(lines, {46: 'A'}))

    def test_2026_columns_do_not_mix_prior_vocabulary_into_question(self):
        def item(x, y, text):
            return {'box': [[x, y], [x+10, y], [x+10, y+8], [x, y+8]], 'text': text, 'confidence': 1.0}
        page = {'page': 1, 'width': 1000, 'height': 1000, 'items': [
            item(20, 100, '全文翻译'), item(550, 120, '前面的词汇'),
            item(20, 700, '26. 答案为A）'), item(20, 720, '解析前半段'),
            item(550, 710, '解析后半段。'), item(550, 740, '27. 答案为B）')]}
        result = lines_2026([page], True)
        self.assertLess(result.index('前面的词汇'), result.index('26. 答案为A）'))
        self.assertLess(result.index('解析后半段。'), result.index('27. 答案为B）'))


if __name__ == '__main__':
    unittest.main()
