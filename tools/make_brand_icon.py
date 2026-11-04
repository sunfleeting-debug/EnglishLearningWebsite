from pathlib import Path
from PIL import Image, ImageDraw
root=Path.cwd(); N=1024
img=Image.new('RGB',(N,N),'#f8f3eb'); d=ImageDraw.Draw(img)
# A quiet editorial mark: open pages frame a path of learning.
d.rounded_rectangle((78,78,946,946),radius=210,fill='#233b35')
d.rounded_rectangle((91,91,933,933),radius=198,outline='#587366',width=3)
d.arc((142,151,882,891),193,347,fill='#c6a96c',width=6)
d.polygon([(220,328),(335,306),(445,333),(512,382),(512,701),(444,655),(335,629),(220,650)],fill='#f7f2e8')
d.polygon([(804,328),(689,306),(579,333),(512,382),(512,701),(580,655),(689,629),(804,650)],fill='#eadfc9')
d.line([(512,391),(512,697)],fill='#233b35',width=12)
d.line([(270,390),(351,380),(433,402)],fill='#a2afa1',width=8)
d.line([(270,437),(350,427),(432,450)],fill='#a2afa1',width=8)
d.line([(592,402),(674,380),(754,390)],fill='#a2afa1',width=8)
d.line([(592,450),(674,427),(754,437)],fill='#a2afa1',width=8)
d.polygon([(512,213),(526,258),(571,272),(526,286),(512,331),(498,286),(453,272),(498,258)],fill='#d6b875')
d.line([(295,748),(729,748)],fill='#d6b875',width=5)
assets=root/'assets/img'
for name,size in [('icon-512.png',512),('icon-192.png',192),('icon-180.png',180),('favicon.png',64)]: img.resize((size,size),Image.Resampling.LANCZOS).save(assets/name)
mask=Image.new('RGB',(N,N),'#f8f3eb'); inner=img.resize((780,780),Image.Resampling.LANCZOS); mask.paste(inner,((N-780)//2,)*2); mask.resize((512,512),Image.Resampling.LANCZOS).save(assets/'icon-maskable-512.png')
img.resize((256,256),Image.Resampling.LANCZOS).save(root/'desktop/icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
for density,px in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
 folder=root/'android/app/src/main/res'/('mipmap-'+density)
 if not folder.exists(): continue
 icon=img.resize((px,px),Image.Resampling.LANCZOS); icon.save(folder/'ic_launcher.png');icon.save(folder/'ic_launcher_round.png')
 fg=Image.new('RGBA',(px,px)); ip=int(px*.66); fg.paste(img.resize((ip,ip),Image.Resampling.LANCZOS),((px-ip)//2,(px-ip)//2));fg.save(folder/'ic_launcher_foreground.png')
