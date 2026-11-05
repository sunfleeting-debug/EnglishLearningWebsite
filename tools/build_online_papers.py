"""Prepare the reviewed personal paper bundle and compressed recordings for the website."""
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATERIALS = ROOT / '星火六级'
SOURCE = MATERIALS / '英语学习站-自动判分题库.json'
TARGET = ROOT / 'data' / 'personal-papers.js'
AUDIO = ROOT / 'audio' / 'personal-papers'


def main():
    import imageio_ffmpeg

    data = json.loads(SOURCE.read_text(encoding='utf-8'))
    if data.get('version') != 1 or not data.get('sets'):
        raise ValueError('题库内容不完整')
    data['source'] = '星火六级资料'
    AUDIO.mkdir(parents=True, exist_ok=True)
    work = []
    for item in data['sets']:
        item['source'] = item.get('source', '').replace('本机星火六级资料', '星火六级资料')
        if item['type'] == 'listening':
            original = MATERIALS / item['audio']
            if not original.is_file():
                raise FileNotFoundError(original)
            target = AUDIO / (item['id'] + '.mp3')
            work.append((original, target))
            item['audio'] = 'audio/personal-papers/' + target.name
            item['audioOnline'] = True
    for item in data.get('writing', []):
        item['sub'] = item.get('sub', '').replace('本机真题', '六级真题')
        item.pop('source', None)

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    def convert(pair):
        original, target = pair
        if target.exists() and target.stat().st_size and target.stat().st_mtime >= original.stat().st_mtime:
            return
        temporary = target.with_suffix('.partial.mp3')
        subprocess.run([ffmpeg, '-nostdin', '-loglevel', 'error', '-y', '-i', str(original),
                        '-vn', '-ac', '1', '-ar', '24000', '-b:a', '40k', str(temporary)], check=True)
        os.replace(temporary, target)

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(convert, work))
    TARGET.write_text('window.TW_PERSONAL_PAPERS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'Prepared {len(data["sets"])} sets, {len(data.get("writing", []))} writing prompts and {len(work)} recordings.')


if __name__ == '__main__':
    main()
