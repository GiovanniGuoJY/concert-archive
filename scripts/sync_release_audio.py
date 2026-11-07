#!/usr/bin/env python3
"""
一键将 GitHub Release (v1.0-audio) 中的 24 首齐默尔曼独奏会 MP3 音频
同步下载到本地仓库的 audio/ 目录，以便通过 GitHub Pages 提供原生流式播放支持。
"""
import os
import urllib.request
import urllib.parse

REPO_OWNER = 'GiovanniGuoJY'
REPO_NAME = 'concert-archive'
TAG = 'v1.0-audio'

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(BASE_DIR, 'audio')
os.makedirs(AUDIO_DIR, exist_ok=True)

TRACKS = [
    '01.Beethoven.Piano.Sonata.No.8.Op.13.Pathetique.Mvt.1.Grave.-.Allegro.di.molto.e.con.brio.mp3',
    '02.Beethoven.Piano.Sonata.No.8.Op.13.Pathetique.Mvt.2.Adagio.cantabile.mp3',
    '03.Beethoven.Piano.Sonata.No.8.Op.13.Pathetique.Mvt.3.Rondo.Allegro.mp3',
    '04.Beethoven.Piano.Sonata.No.21.Op.53.Waldstein.Mvt.1.Allegro.con.brio.mp3',
    '05.Beethoven.Piano.Sonata.No.21.Op.53.Waldstein.Mvt.2.Introduzione.Adagio.molto.mp3',
    '06.Beethoven.Piano.Sonata.No.21.Op.53.Waldstein.Mvt.3.Rondo.Allegretto.moderato.-.Prestissimo.mp3',
    '07.Statkowski.Prelude.in.C.major.Op.37.No.1.mp3',
    '08.Bach.Prelude.No.1.in.C.major.BWV.846.mp3',
    '09.Scriabin.Prelude.in.A.minor.Op.11.No.2.mp3',
    '10.Debussy.Clair.de.lune.from.Suite.bergamasque.L.75.No.3.mp3',
    '11.Chopin.Prelude.in.B-flat.minor.Op.28.No.16.mp3',
    '12.Godowsky.The.Gardens.of.Buitenzorg.from.Java.Suite.No.8.mp3',
    '13.Bacewicz.Largo.in.F.minor.from.Piano.Sonata.No.2.mp3',
    '14.Debussy.Minstrels.from.Preludes.Book.I.L.117.No.12.mp3',
    '15.Ravel.Forlane.from.Le.Tombeau.de.Couperin.M.68.No.3.mp3',
    '16.Rachmaninoff.Prelude.in.D.major.Op.23.No.4.mp3',
    '17.Franck.Prelude.in.B.minor.from.Prelude.Fugue.et.Variation.Op.18.arr.Bauer.mp3',
    '18.Schubert.Impromptu.in.G-flat.major.D.899.No.3.mp3',
    '19.Gershwin.Prelude.No.3.in.E-flat.minor.mp3',
    '20.Szymanowski.Variation.VII.in.B.major.from.Variations.on.a.Polish.Folk.Theme.Op.10.mp3',
    '21.Rachmaninoff.Prelude.in.G-sharp.minor.Op.32.No.12.mp3',
    '22.Kapustin.Prelude.in.E.major.Op.53.No.9.mp3',
    '23.Rachmaninoff.Prelude.in.C-sharp.minor.Op.3.No.2.mp3',
    '24.Schubert.Impromptu.in.E-flat.major.D.899.No.2.mp3'
]

def main():
    print(f"🎵 准备下载 {len(TRACKS)} 首音频到: {AUDIO_DIR}")
    for idx, filename in enumerate(TRACKS, 1):
        target_path = os.path.join(AUDIO_DIR, filename)
        if os.path.exists(target_path) and os.path.getsize(target_path) > 1000:
            print(f"[{idx:02d}/{len(TRACKS)}] 已存在跳过: {filename}")
            continue

        url = f"https://github.com/{REPO_OWNER}/{REPO_NAME}/releases/download/{TAG}/{urllib.parse.quote(filename)}"
        print(f"[{idx:02d}/{len(TRACKS)}] 正在下载: {filename} ...")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as resp, open(target_path, 'wb') as out_f:
                out_f.write(resp.read())
            size_mb = os.path.getsize(target_path) / (1024 * 1024)
            print(f"      ✅ 完成 ({size_mb:.2f} MB)")
        except Exception as e:
            print(f"      ❌ 下载失败: {e}")

    print("\n🎉 音频同步完毕！你现在可以通过以下命令推送到 GitHub Pages：")
    print("git add audio")
    print("git commit -m 'feat: host release audio directly on GitHub Pages for seamless streaming'")
    print("git push origin main")

if __name__ == '__main__':
    main()
