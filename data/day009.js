/* DVA-C02 模擬試験 Day 009 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "009",
  date: "2026-10-02",
  title: "Lambda SnapStart・環境変数の暗号化ヘルパー・Lambda レイヤーの構造・API Gateway キャッシュ・DynamoDB と OpenSearch の連携",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・3・4 横断） ---------- */
  {
    id: "q1",
    domain: "分野1 開発 / 分野3 デプロイ / 分野4 トラブルシューティングと最適化",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>ある会社の注文 API は、API Gateway（REST API）から Java 21 の Lambda 関数 <code>OrderFunction</code> を呼び出している。関数は AWS SAM で管理されており、初期化処理でフレームワークの読み込みと DB の接続プールの作成を行うため、コールドスタート時の応答が 5〜6 秒かかっている。関数の初期化コードは次のとおりである。</p>
  <pre><code>public class OrderHandler implements RequestHandler&lt;APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent&gt; {
    private static final DataSource POOL = createPool();          // DB 接続プール
    private static final Random RNG = new Random(System.nanoTime()); // 注文番号の採番用
    ...
}</code></pre>
  <p>開発者は Lambda SnapStart を使ってコールドスタートを短縮したい。要件は次のとおりである。</p>
  <ul>
  <li>プロビジョニングされた同時実行の料金はかけない。設定は SAM テンプレートで管理する。</li>
  <li>実行環境が増えても、注文番号が重複しない。</li>
  <li>スナップショットから再開した実行環境でも、DB の接続が有効な状態で処理できる。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `SAM テンプレートの関数に次の設定を追加し、API のイベントがエイリアス <code>live</code> を呼び出すようにする。
  <pre><code>OrderFunction:
  Type: AWS::Serverless::Function
  Properties:
    Runtime: java21
    SnapStart:
      ApplyOn: PublishedVersions
    AutoPublishAlias: live</code></pre>`,
        why: `SnapStart は、関数のバージョンを公開するときに初期化を実行し、初期化済みの実行環境のスナップショットを作成します。そのため、SnapStart が使えるのは<strong>公開済みのバージョンと、バージョンを指すエイリアスだけ</strong>です。<code>AutoPublishAlias</code> を指定すると、SAM はデプロイのたびに新しいバージョンを公開してエイリアスを更新し、関数のイベント（API Gateway の統合）もエイリアスを呼び出すように設定します。` },
      { correct: false, html: `関数の <code>SnapStart</code> を <code>PublishedVersions</code> にするが、バージョンやエイリアスは作らず、API Gateway からはこれまでどおり <code>$LATEST</code> を呼び出す。`,
        why: `SnapStart は<strong>未公開のバージョン（<code>$LATEST</code>）では使えません</strong>（一見できそうで実際には効果がない構成）。<code>$LATEST</code> を呼び出し続ける限り、通常どおり初期化が実行され、コールドスタートは短くなりません。` },
      { correct: false, html: `SnapStart に加えて、エイリアス <code>live</code> にプロビジョニングされた同時実行を 5 設定し、最初の 5 つの実行環境はさらに速く応答できるようにする。`,
        why: `SnapStart は、<strong>プロビジョニングされた同時実行とは併用できません</strong>（一見できそうで不可能な構成）。EFS や 512 MB を超えるエフェメラルストレージとも併用できません。料金をかけないという要件にも反します。` },
      { correct: true, html: `注文番号の採番を次のように変更し、初期化時に作った乱数生成器の状態がスナップショットに含まれても、実行環境ごとに異なる値が生成されるようにする。
  <pre><code>private static final SecureRandom RNG = new SecureRandom();

public APIGatewayProxyResponseEvent handleRequest(...) {
    String orderNo = String.format("%016x", RNG.nextLong());  // ハンドラー内で生成
    ...
}</code></pre>`,
        why: `SnapStart では、1 つのスナップショットから複数の実行環境が再開されるため、初期化時に作った値や乱数生成器の内部状態がすべての実行環境で<strong>同じ</strong>になります。<code>System.nanoTime()</code> をシードにした <code>java.util.Random</code> は、どの実行環境でも同じ乱数列を返し、注文番号が重複します。Lambda のマネージド Java ランタイムの <code>java.security.SecureRandom</code> のような暗号論的に安全な乱数生成器は、復元後も一意性が保たれます。一意な値はハンドラー内で生成するのが原則です。` },
      { correct: true, html: `ハンドラークラスに CRaC の <code>Resource</code> を実装し、コンストラクターで <code>Core.getGlobalContext().register(this)</code> を呼び出す。<code>beforeCheckpoint()</code> で接続プールを閉じ、<code>afterRestore()</code> で接続プールを作り直す。`,
        why: `初期化時に確立したネットワーク接続は、スナップショットから再開したときに有効である保証がありません。ランタイムフックを使うと、スナップショットの作成直前（<code>beforeCheckpoint</code>）と再開直後（<code>afterRestore</code>）に処理を実行できます。ハンドラーのインスタンス自身を登録しているので、強参照が保たれ、フックが確実に実行されます。` },
      { correct: false, html: `接続プールを作り直すランタイムフックを、次のように匿名クラスで登録する。
  <pre><code>static {
    Core.getGlobalContext().register(new Resource() {
        public void beforeCheckpoint(Context&lt;? extends Resource&gt; c) { closePool(); }
        public void afterRestore(Context&lt;? extends Resource&gt; c) { reopenPool(); }
    });
}</code></pre>`,
        why: `CRaC の <code>Context</code> は、登録された <code>Resource</code> を<strong>弱参照</strong>でしか保持しません。匿名クラスのオブジェクトなど、どこからも強参照されていないオブジェクトはガベージコレクションで回収され、ランタイムフックが実行されなくなります。登録するオブジェクトへの強参照を保持する必要があります。` },
      { correct: false, html: `SnapStart は呼び出しが終わるたびに実行環境のスナップショットを更新するため、ハンドラー内で作成した接続やキャッシュも次のコールドスタートで復元される。そのため、初期化コードを変更する必要はない。`,
        why: `スナップショットが作成されるのは、<strong>バージョンを公開して初期化が完了した時点</strong>だけです。呼び出しのたびに更新されるわけではありません。ハンドラー内で作った状態はスナップショットに含まれず、一意性や接続についての考慮も必要です。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <p>この問題は「Lambda のパフォーマンスチューニング（分野1）」「バージョンとエイリアス、SAM テンプレート（分野3）」「パフォーマンス問題の分析と最適化（分野4）」を横断しています。</p>
  <ul>
  <li><strong>SnapStart の対象</strong>: Java 11 以降、Python 3.12 以降、.NET 8 以降。公開済みのバージョン（とそれを指すエイリアス）だけで使える。プロビジョニングされた同時実行、EFS、512 MB を超えるエフェメラルストレージとは併用できない。</li>
  <li><strong>一意性</strong>: 初期化時に一意な ID や乱数のシードを作らない。ハンドラー内で生成するか、CSPRNG（Java の <code>SecureRandom</code>、Python の <code>random.SystemRandom</code> など）を使うか、ランタイムフックで作り直す。Java には SpotBugs のスキャンツールもある。</li>
  <li><strong>ネットワーク接続と一時データ</strong>: 初期化時に作った接続や一時的な認証情報は、再開後に有効か確認し、必要ならランタイムフックやハンドラーで作り直す（AWS SDK の接続は多くの場合自動で再開する）。</li>
  <li><strong>料金</strong>: Java ではスナップショットの追加料金はない。Python と .NET では、スナップショットのキャッシュと復元に料金がかかる。</li>
  </ul>`,
    refs: [
      ["Lambda: SnapStart による起動パフォーマンスの向上", "https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html"],
      ["Lambda: SnapStart での一意性の扱い", "https://docs.aws.amazon.com/lambda/latest/dg/snapstart-uniqueness.html"],
      ["Lambda: Java の SnapStart ランタイムフック", "https://docs.aws.amazon.com/lambda/latest/dg/snapstart-runtime-hooks-java.html"],
      ["AWS SAM: AWS::Serverless::Function", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html"]
    ]
  },

  /* ---------- Q2: セキュリティ（環境変数の暗号化） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ",
    tag: "疑似コード",
    type: "single", pick: 1,
    text: `
  <p>ある Lambda 関数（Python）は、外部の決済サービスの API キーを環境変数 <code>PAYMENT_API_KEY</code> から読み取っている。セキュリティ監査で次の要件が示された。</p>
  <ul>
  <li>API キーは、Lambda の API に送信される前に<strong>クライアント側で暗号化</strong>されていること（転送中の保護）。</li>
  <li>関数の設定を参照できる開発者にも、コンソールや API で平文の値が見えないこと。</li>
  <li>復号できるのは関数の実行ロールだけであること。</li>
  </ul>
  <p>開発者は、Lambda コンソールの「転送時の暗号化のためのヘルパー」を有効にし、カスタマーマネージドキー <code>payment-key</code> で <code>PAYMENT_API_KEY</code> を暗号化した。関数の実行ロールには <code>payment-key</code> への <code>kms:Decrypt</code> を許可している。</p>
  <p>関数のコードはどのように実装すればよいですか。</p>`,
    options: [
      { correct: true, html: `<pre><code>import base64, os, boto3

ENCRYPTED = os.environ["PAYMENT_API_KEY"]
API_KEY = boto3.client("kms").decrypt(
    CiphertextBlob=base64.b64decode(ENCRYPTED),
    EncryptionContext={
        "LambdaFunctionName": os.environ["AWS_LAMBDA_FUNCTION_NAME"]
    },
)["Plaintext"].decode("utf-8")

def handler(event, context):
    return call_payment_api(API_KEY, event)</code></pre>`,
        why: `暗号化ヘルパーで暗号化した値は、環境変数に Base64 エンコードされた暗号文として保存されます。コンソールのヘルパーは、関数名を暗号化コンテキスト（<code>LambdaFunctionName</code>）として指定して暗号化するため、復号時にも同じ暗号化コンテキストを渡す必要があります。復号はハンドラーの外（初期化時）で 1 回だけ行い、呼び出しのたびに KMS を呼ばないようにしています。` },
      { correct: false, html: `<pre><code>import base64, os, boto3

def handler(event, context):
    api_key = boto3.client("kms").decrypt(
        CiphertextBlob=base64.b64decode(os.environ["PAYMENT_API_KEY"])
    )["Plaintext"].decode("utf-8")
    return call_payment_api(api_key, event)</code></pre>`,
        why: `暗号化コンテキストを指定していないため、暗号化時のコンテキスト（<code>LambdaFunctionName</code>）と一致せず、KMS は <code>InvalidCiphertextException</code> を返して復号に失敗します。暗号化コンテキストは追加の認証データとして暗号文に結び付けられており、復号時にも同じ値が必要です。また、呼び出しのたびに KMS を呼んでいるため、遅延と KMS のリクエスト料金が増え、KMS のクォータにも達しやすくなります。` },
      { correct: false, html: `<pre><code>import os

API_KEY = os.environ["PAYMENT_API_KEY"]  # Lambda が自動で復号して渡す

def handler(event, context):
    return call_payment_api(API_KEY, event)</code></pre>`,
        why: `Lambda が自動で復号するのは、保管時の暗号化（サーバー側暗号化）だけです。暗号化ヘルパーで<strong>クライアント側で暗号化した値</strong>は、暗号文のまま関数に渡されます。このコードでは暗号文（Base64 文字列）を API キーとして送ってしまい、決済サービスの認証に失敗します。` },
      { correct: false, html: `暗号化ヘルパーは使わず、関数の保管時の暗号化にカスタマーマネージドキー <code>payment-key</code> を指定する。コードでは <code>os.environ["PAYMENT_API_KEY"]</code> をそのまま使う。`,
        why: `保管時の暗号化にカスタマーマネージドキーを使うと、キーへのアクセス権がないユーザーは環境変数を参照できなくなります。しかし、値は<strong>平文のまま</strong> Lambda の API（や CloudFormation テンプレート）に送られ、Lambda 側で暗号化されます。「API に送信される前にクライアント側で暗号化」という要件を満たせません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>保管時の暗号化</strong>: Lambda は環境変数を常に KMS で暗号化して保存する（既定は AWS マネージドキー）。カスタマーマネージドキーにすると、キーを使えるユーザーだけが環境変数を参照できる。関数には復号済みの値が渡される。</li>
  <li><strong>転送時の暗号化ヘルパー</strong>: コンソールで値をクライアント側暗号化する。関数には暗号文が渡されるので、コードで <code>kms:Decrypt</code>（暗号化コンテキスト <code>LambdaFunctionName</code> 付き）を呼ぶ必要があり、実行ロールに権限が必要。</li>
  <li><strong>より良い選択肢</strong>: AWS は、DB の認証情報などの機密情報は環境変数ではなく Secrets Manager に保存することを推奨している。ローテーションや一元管理が可能になる。</li>
  </ul>`,
    refs: [
      ["Lambda: 環境変数の保護", "https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars-encryption.html"],
      ["AWS KMS: 暗号化コンテキスト", "https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html"],
      ["Lambda: Lambda 関数での Secrets Manager シークレットの使用", "https://docs.aws.amazon.com/lambda/latest/dg/with-secrets-manager.html"]
    ]
  },

  /* ---------- Q3: デプロイ（Lambda レイヤーのディレクトリ構造） ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "アーティファクトの準備",
    type: "multi", pick: 2,
    text: `
  <p>開発者は、3 つの Python 3.12 の Lambda 関数で共通して使うライブラリ <code>requests</code> と、社内の共通モジュール <code>common_utils</code> を Lambda レイヤーにまとめた。レイヤーの .zip ファイルの構成は次のとおりである。</p>
  <pre><code>shared-layer.zip
├── common_utils/
│   ├── __init__.py
│   └── logging.py
└── requests/
    └── ...</code></pre>
  <p>レイヤーを関数に追加してデプロイしたところ、関数の呼び出し時に次のエラーが発生した。</p>
  <pre><code>Runtime.ImportModuleError: Unable to import module 'app': No module named 'common_utils'</code></pre>
  <p>このエラーを解消し、今後 <code>common_utils</code> を更新したときにも各関数に正しく反映させるために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `.zip ファイルの最上位に <code>python/</code> ディレクトリを作り、<code>python/common_utils/</code> と <code>python/requests/</code> の構成にしてレイヤーの新しいバージョンを公開する。`,
        why: `レイヤーの内容は、実行環境の <code>/opt</code> ディレクトリに展開されます。Python ランタイムは <code>/opt/python</code> と <code>/opt/python/lib/python3.x/site-packages</code> をモジュールの検索パスに含めています。最上位にモジュールを置くと <code>/opt/common_utils</code> に展開され、検索パスに含まれないため <code>ImportModuleError</code> になります。` },
      { correct: true, html: `<code>common_utils</code> を更新するときは、レイヤーの新しいバージョンを公開したうえで、各関数のレイヤー設定を新しいバージョンの ARN に更新する（SAM では、レイヤーのリソースを <code>!Ref</code> で参照して関数と一緒にデプロイする）。`,
        why: `レイヤーのバージョンは<strong>変更できない（イミュータブル）</strong>スナップショットで、更新するたびに新しいバージョン番号の ARN が作られます。関数はバージョン番号を含む ARN でレイヤーを参照しているため、関数の設定を更新しない限り古いバージョンを使い続けます。SAM でレイヤーと関数を同じテンプレートで管理すると、デプロイ時に新しいバージョンへの参照が自動で更新されます。` },
      { correct: false, html: `.zip ファイルの最上位に <code>opt/python/</code> ディレクトリを作り、<code>opt/python/common_utils/</code> の構成にする。`,
        why: `レイヤーの内容は <code>/opt</code> の<strong>下に</strong>展開されるため、この構成では <code>/opt/opt/python/common_utils</code> になり、検索パスに含まれません。.zip ファイル内のパスは <code>/opt</code> からの相対パスとして考えます。` },
      { correct: false, html: `レイヤーの新しいバージョンを公開すれば、そのレイヤーを使っているすべての関数で自動的に新しいバージョンが使われるため、関数の設定を変更する必要はない。`,
        why: `関数は<strong>特定のバージョンの ARN</strong>（例: <code>...:layer:shared:3</code>）でレイヤーを参照します。新しいバージョンを公開しても、既存の関数が自動で切り替わることはありません。意図しない変更が本番の関数に反映されないための仕組みでもあります。` },
      { correct: false, html: `レイヤーは関数の実行時に <code>/tmp</code> に展開されるため、関数のコードの先頭で <code>sys.path.append("/tmp")</code> を実行して検索パスに追加する。`,
        why: `レイヤーが展開されるのは <code>/tmp</code> ではなく <strong><code>/opt</code></strong> です。<code>/tmp</code> は関数が一時ファイルを書き込むためのエフェメラルストレージです。検索パスを手動で変えるより、ランタイムが既定で参照するディレクトリ構成でレイヤーを作るのが正しい方法です。` },
      { correct: false, html: `ライブラリごとにレイヤーを分け、<code>requests</code>、<code>urllib3</code>、<code>certifi</code>、<code>idna</code>、<code>charset_normalizer</code>、<code>common_utils</code> の 6 つのレイヤーを各関数に追加する。依存関係が分かれるので更新もしやすくなる。`,
        why: `1 つの関数に追加できるレイヤーは<strong>最大 5 つ</strong>なので、6 つのレイヤーは追加できません（一見できそうで不可能な構成）。また、レイヤーが増えると依存関係の管理が複雑になります。関連するライブラリは 1 つのレイヤーにまとめます。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>レイヤーのパス</strong>: 内容は <code>/opt</code> に展開される。Python は <code>python/</code> または <code>python/lib/python3.x/site-packages/</code>、Node.js は <code>nodejs/node_modules/</code>、Java は <code>java/lib/</code>、実行ファイルは <code>bin/</code>、共有ライブラリは <code>lib/</code> に置く。</li>
  <li><strong>バージョン</strong>: レイヤーのバージョンはイミュータブル。関数はバージョン付きの ARN で参照する。</li>
  <li><strong>制限</strong>: 1 つの関数に最大 5 つのレイヤー。関数とすべてのレイヤーの合計で展開後 250 MB まで。レイヤーは .zip 形式の関数だけで使え、コンテナイメージの関数では使えない。</li>
  <li>ネイティブ拡張を含むライブラリは、Lambda と同じ Amazon Linux 環境（Docker や <code>sam build --use-container</code>）でビルドする。</li>
  </ul>`,
    refs: [
      ["Lambda: レイヤーの内容のパッケージング", "https://docs.aws.amazon.com/lambda/latest/dg/packaging-layers.html"],
      ["Lambda: レイヤーによる依存関係の管理", "https://docs.aws.amazon.com/lambda/latest/dg/chapter-layers.html"],
      ["Lambda: AWS SAM でのレイヤーの使用", "https://docs.aws.amazon.com/lambda/latest/dg/layers-sam.html"]
    ]
  },

  /* ---------- Q4: 最適化（API Gateway のキャッシュ） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化",
    tag: "キャッシュの設定",
    type: "multi", pick: 2,
    text: `
  <p>ある EC サイトの商品一覧 API は、API Gateway の REST API の <code>GET /products?category=...&amp;sessionId=...</code> で提供されている。<code>category</code> によって返す商品が変わる。<code>sessionId</code> はアクセス解析のためだけに付けられており、レスポンスの内容には影響しない。</p>
  <p>バックエンドの負荷を下げるため、<code>prod</code> ステージで API キャッシュを有効にした（TTL 300 秒）。要件は次のとおりである。</p>
  <ul>
  <li>カテゴリごとにレスポンスをキャッシュし、同じカテゴリならセッションが違ってもキャッシュを使う。</li>
  <li>管理者が商品を更新したら、<strong>そのカテゴリのキャッシュだけ</strong>をすぐに最新化できる。</li>
  <li>一般のクライアントはキャッシュを無効化できない。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `<code>GET /products</code> のメソッドリクエストでクエリ文字列パラメータ <code>category</code> を定義してキャッシュキーに指定する。<code>sessionId</code> はキャッシュキーに含めない。`,
        why: `API Gateway のキャッシュは、キャッシュキーに指定したパラメータの値ごとにレスポンスを分けて保存します。<code>category</code> だけをキャッシュキーにすると、カテゴリごとにキャッシュされ、<code>sessionId</code> が違うリクエストでも同じキャッシュを使えます。` },
      { correct: true, html: `ステージのキャッシュ設定で無効化に認可を必須にし、権限のないリクエストは <code>403</code> で失敗させる（<code>FAIL_WITH_403</code>）。管理者のロールに <code>arn:aws:execute-api:...:{api-id}/prod/GET/products</code> への <code>execute-api:InvalidateCache</code> を許可し、管理者は SigV4 で署名した <code>Cache-Control: max-age=0</code> ヘッダー付きのリクエストを送る。`,
        why: `クライアントは <code>Cache-Control: max-age=0</code> ヘッダーを付けたリクエストで、該当するキャッシュエントリだけを無効化してバックエンドから再取得できます。認可を必須にしないと誰でもキャッシュを無効化でき、バックエンドの負荷が増えてしまいます。<code>execute-api:InvalidateCache</code> を許可されたプリンシパルだけが無効化でき、それ以外のリクエストをどう扱うか（403 で失敗させる、ヘッダーを無視する、など）を選べます。` },
      { correct: false, html: `<code>category</code> と <code>sessionId</code> の両方をキャッシュキーに指定し、どのパラメータでもレスポンスが正しくキャッシュされるようにする。`,
        why: `<code>sessionId</code> もキャッシュキーに含まれるため、セッションごとに別々のキャッシュエントリが作られます。同じカテゴリでもほとんどのリクエストがキャッシュミスになり、バックエンドの負荷はほとんど下がりません。キャッシュキーには、レスポンスを変えるパラメータだけを含めます。` },
      { correct: false, html: `管理者が商品を更新するたびに、<code>flush-stage-cache</code> を実行してステージのキャッシュ全体をフラッシュする。`,
        why: `ステージのキャッシュ全体がクリアされるため、更新していないカテゴリのキャッシュも失われ、その後しばらくはすべてのリクエストがバックエンドに送られます。「そのカテゴリのキャッシュだけを最新化する」という要件を満たせません。` },
      { correct: false, html: `料金を抑えるため API を HTTP API に移行し、HTTP API のルートでキャッシュを有効にして、<code>category</code> をキャッシュキーに指定する。`,
        why: `API Gateway の API キャッシュは <strong>REST API の機能</strong>で、HTTP API ではサポートされていません（一見できそうで不可能な構成）。HTTP API でキャッシュしたい場合は、CloudFront を前段に置くなどの方法をとります。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>API キャッシュ</strong>: ステージ単位で有効にし、キャッシュの容量を選ぶ（時間単位の料金）。TTL は既定 300 秒、最大 3600 秒。既定では <code>GET</code> メソッドだけがキャッシュされ、メソッドごとに設定を上書きできる。</li>
  <li><strong>キャッシュキー</strong>: ヘッダー、パス、クエリ文字列などのパラメータを指定する。レスポンスを変えるものだけを含めると、ヒット率が上がる。</li>
  <li><strong>無効化</strong>: エントリ単位は <code>Cache-Control: max-age=0</code>（<code>execute-api:InvalidateCache</code> で認可）、ステージ全体はフラッシュ。</li>
  <li><strong>監視</strong>: <code>CacheHitCount</code> と <code>CacheMissCount</code> のメトリクスで効果を確認する。機密データを含むレスポンスはキャッシュデータの暗号化を有効にする。</li>
  </ul>`,
    refs: [
      ["API Gateway: REST API のキャッシュ設定", "https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.html"],
      ["API Gateway: HTTP API と REST API の選択", "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html"]
    ]
  },

  /* ---------- Q5: 開発（目的に合ったデータストア） ---------- */
  {
    id: "q5",
    domain: "分野1 開発",
    tag: "最小限の構成作業量",
    type: "single", pick: 1,
    text: `
  <p>ある EC サイトの商品カタログは、DynamoDB テーブル <code>Products</code>（パーティションキー <code>productId</code>、約 200 万項目）に保存されている。商品名と説明文に対して、次のような検索機能を追加することになった。</p>
  <ul>
  <li>キーワードを含む商品を、関連度の高い順に返す（全文検索）。多少の表記ゆれやタイプミスも許容する。</li>
  <li>商品の追加・更新・削除は、数秒程度の遅れで検索結果に反映される。既存の全商品も検索対象にする。</li>
  <li>商品の登録処理（DynamoDB への書き込み）は変更しない。</li>
  </ul>
  <p>最小限の構成作業量でこの要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `Amazon OpenSearch Service のドメインを作成し、DynamoDB の zero-ETL 統合（DynamoDB をソースとする OpenSearch Ingestion パイプライン）を設定する。テーブルでは DynamoDB Streams とポイントインタイムリカバリ（PITR）を有効にし、初期スナップショットを取り込んだあと変更を継続的に同期する。`,
        why: `OpenSearch Service は、関連度によるスコアリングやあいまい検索（fuzzy）などの全文検索に適したデータストアです。DynamoDB の zero-ETL 統合を使うと、OpenSearch Ingestion が PITR を使ったエクスポートで既存のデータを取り込み、その後は DynamoDB Streams の変更をほぼリアルタイムで反映します。同期のためのコードを書く必要がなく、登録処理も変更しません。` },
      { correct: false, html: `DynamoDB Streams を有効にし、ストリームをトリガーとする Lambda 関数を作成して、変更内容を OpenSearch Service のインデックスに書き込むコードを実装する。既存の全商品は、別途テーブルをスキャンしてインデックスに登録するスクリプトで取り込む。`,
        why: `要件は満たせますが、インデックス作成用の関数、エラーや再試行の処理、初期データ取り込み用のスクリプトなどを自分で開発・運用する必要があります。マネージドな zero-ETL 統合に比べて作業量が多く、「最小限の構成作業量」とは言えません。` },
      { correct: false, html: `検索のたびに <code>Scan</code> を実行し、<code>FilterExpression</code> の <code>contains(description, :keyword)</code> でキーワードを含む商品を絞り込む。`,
        why: `<code>Scan</code> は毎回テーブル全体（約 200 万項目）を読み取るので、遅延が大きく、読み込みキャパシティも大量に消費します。<code>contains</code> は単純な部分一致で、関連度による並べ替えや表記ゆれ・タイプミスへの対応はできません。` },
      { correct: false, html: `<code>description</code> をパーティションキー、<code>productId</code> をソートキーとする GSI を作成し、<code>Query</code> でキーワードを指定して検索する。`,
        why: `<code>Query</code> のパーティションキーには等価条件しか使えないため、説明文全体と完全に一致する場合しか検索できません。DynamoDB のキー設計は決まったアクセスパターンでの高速な取得のためのもので、全文検索には向きません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>目的に合ったデータストア</strong>: キーによる高速な読み書きは DynamoDB、全文検索・あいまい検索・集計（アグリゲーション）やログ分析は OpenSearch Service、キャッシュは ElastiCache / DAX、というように、アクセスパターンでデータストアを選ぶ。</li>
  <li><strong>DynamoDB の zero-ETL 統合</strong>: OpenSearch Ingestion のパイプラインが、初期スナップショット（PITR を使ったエクスポート）と DynamoDB Streams による変更の取り込みを自動で行う。同じアカウント・同じリージョンのテーブルが対象。</li>
  <li><strong>Streams の制約</strong>: ストリームのデータは 24 時間しか保持されないため、パイプラインの処理能力（OCU）を適切に設定する。</li>
  <li>DynamoDB でのフィルター式は読み取り後に適用されるため、キャパシティの節約にはならない。</li>
  </ul>`,
    refs: [
      ["OpenSearch Service: DynamoDB での OpenSearch Ingestion パイプラインの使用", "https://docs.aws.amazon.com/opensearch-service/latest/developerguide/configure-client-ddb.html"],
      ["DynamoDB: OpenSearch Service との zero-ETL 統合", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/OpenSearchIngestionForDynamoDB.html"],
      ["Amazon OpenSearch Service とは", "https://docs.aws.amazon.com/opensearch-service/latest/developerguide/what-is.html"]
    ]
  }
  ]
});
