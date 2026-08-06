# stamp-cut

写真をアップロードするだけで、LINE Creators Market にそのまま申請できるスタンプ用アセット一式
(`main.png` / `tab.png` / `01.png`〜)を生成する Web ツール。

すべての処理(背景除去の推論を含む)はブラウザ内で完結し、画像が外部サーバーに送信されることはありません。
要件は [docs/requirements.md](docs/requirements.md) を参照。

## 機能

- 複数枚一括アップロード(JPEG / PNG / WebP / HEIC、ドラッグ&ドロップ対応)
- 被写体の自動切り抜き(`@imgly/background-removal`、WASM/WebGPU)
- 背景除去モード: 標準(モデル出力そのまま)/ しっかり(アルファ二極化+連結成分分析で背景の残りを除去)。アップロード時の既定と画像ごとの切替の両方に対応
- ブラシによる手動補正(消す / 残す)
- テキスト追加(ドラッグ配置・縁取り)・ステッカー風白フチ
- LINE 規格への自動整形(370×320 以内・偶数 px・余白 10px・透過 PNG・1MB 以下)
- メイン画像(240×240)・タブ画像(96×74)の自動生成
- トーク画面風プレビュー(ライト / ダーク背景)
- 申請規則どおりのファイル名で ZIP 書き出し

## 開発

```bash
npm install
npm run dev      # 開発サーバー(モデルは node_modules から /imgly/ に配信される)
npm run build    # 型チェック + 本番ビルド(dist/ にモデル一式もコピーされる)
npm run preview  # 本番ビルドの確認
```

デバッグ用 URL パラメータ:

- `?nobg` — 背景除去をスキップ(E2E テスト・低速端末での動作確認用)
- `?model=small` — 小型モデル(isnet_quint8)を使用。既定は `isnet_fp16`

## デプロイ(Cloudflare Workers 静的アセット・無料枠)

初回のみ:

```bash
npx wrangler login   # ブラウザが開くので Cloudflare アカウントで認可
```

以降は 1 コマンド:

```bash
npm run deploy       # build して https://stamp-cut.<subdomain>.workers.dev に公開
```

- 静的アセット配信のみのため **無料枠で運用でき、リクエスト課金もない**
- モデルはチャンク分割済み(1 ファイル最大 4MiB、onnxruntime の WASM も 25MiB 以下)のため、
  Cloudflare の 1 ファイル 25MiB 制限には抵触しない
- 初回デプロイはモデル一式(約 270MB)のアップロードに数分かかる。2 回目以降は
  ハッシュ差分のみのアップロードになるため速い
- 限定公開したい場合は Cloudflare Zero Trust(Access)で `*.workers.dev` の
  アプリケーションを作り、自分のメールアドレスだけ許可する(無料枠 50 ユーザーまで)

## 実装メモ

- npm 配布の `@imgly/background-removal-data`(1.4.x)は本体(1.7.x)とマニフェスト形式が
  ずれているため、`vite.config.ts` でコピー時に `resources.json` を変換して整合させている
  (チャンクの `name` 補完・モデルキーの別名追加・onnxruntime エントリの差し替え)。
- LINE の規格値(サイズ・個数・容量)は `src/types.ts` の `SPEC` に一元管理している。
