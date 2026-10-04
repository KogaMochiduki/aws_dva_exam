/* DVA-C02 模擬試験 Day 012 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "012",
  date: "2026-10-04",
  title: "Firehose の変換 Lambda による PII マスキング・S3 の転送中/保管中の暗号化の強制・CodeArtifact による依存関係管理・X-Ray のサンプリングルール・SNS から SQS へのファンアウト",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・2・4 横断） ---------- */
  {
    id: "q1",
    domain: "分野1 開発 / 分野2 セキュリティ / 分野4 トラブルシューティングと最適化",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>あるモバイルアプリは、操作ログ（JSON、1 件あたり約 1 KB）を Amazon Data Firehose（Direct PUT）に送信し、S3 バケットに保存している。分析チームから次の要件が示された。</p>
  <ul>
  <li>S3 に保存する前に、ログの <code>email</code> と <code>phone</code> をマスキングする（PII を分析用バケットに残さない）。</li>
  <li>ロードバランサーのヘルスチェックによるログ（<code>"type": "healthcheck"</code>）は保存しない。</li>
  <li>JSON として解析できないログは捨てずに別の場所に残し、原因を調べられるようにする。</li>
  <li>変換処理はほぼリアルタイム（数分以内）で行う。</li>
  </ul>
  <p>開発者は Firehose のデータ変換に Lambda 関数を使うことにした。これらの要件を満たす実装・設定として正しいものはどれですか。<strong>3 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `変換用の Lambda 関数を次のように実装する。
  <pre><code>import base64, json, re

def mask(v):
    return re.sub(r"[^@.]", "*", v[:-4]) + v[-4:] if v else v

def handler(event, context):
    out = []
    for r in event["records"]:
        try:
            log = json.loads(base64.b64decode(r["data"]))
        except ValueError:
            out.append({"recordId": r["recordId"], "result": "ProcessingFailed",
                        "data": r["data"]})
            continue
        if log.get("type") == "healthcheck":
            out.append({"recordId": r["recordId"], "result": "Dropped",
                        "data": r["data"]})
            continue
        for k in ("email", "phone"):
            log[k] = mask(log.get(k))
        body = (json.dumps(log) + "\\n").encode()
        out.append({"recordId": r["recordId"], "result": "Ok",
                    "data": base64.b64encode(body).decode()})
    return {"records": out}</code></pre>`,
        why: `Firehose は変換後のレコードごとに <code>recordId</code>（入力と同じ値）、<code>result</code>、<code>data</code>（Base64 エンコード）を要求します。<code>result</code> は、変換に成功したら <code>Ok</code>、意図的に捨てるなら <code>Dropped</code>、変換できなかったら <code>ProcessingFailed</code> にします。<code>Ok</code> と <code>Dropped</code> は処理成功として扱われ、<code>Dropped</code> のレコードは配信されません。末尾に改行を付けているのは、S3 で 1 行 1 レコードとして扱えるようにするためです。` },
      { correct: true, html: `Firehose ストリームのデータ変換で関数を指定し、Lambda の呼び出し用のバッファリングのヒントを 1 MB / 60 秒にする。関数のタイムアウトは 1 分にし、Firehose ストリームの IAM ロールにはこの関数の <code>lambda:InvokeFunction</code> と <code>lambda:GetFunctionConfiguration</code> を許可する。`,
        why: `Firehose は受信したデータを Lambda 用にバッファリングし（サイズは 0.2〜3 MB、間隔は 0〜900 秒、既定は 1 MB / 60 秒）、<strong>同期呼び出し</strong>で関数を実行します。同期呼び出しのペイロードは要求・応答ともに 6 MB までなので、バッファサイズはそれ以下にします。関数は Firehose ストリームの IAM ロールの権限で呼び出されるため、公式のポリシー例のとおり、ロールに <code>lambda:InvokeFunction</code> と <code>lambda:GetFunctionConfiguration</code> の許可が必要です。` },
      { correct: true, html: `<code>ProcessingFailed</code> のレコードは、配信先の S3 バケットの <code>processing-failed</code> フォルダー（エラー出力プレフィックスを指定した場合はその場所）に、Base64 エンコードされた元のデータ（<code>rawData</code>）やエラーの情報とともに保存されるため、そこで原因を調べて再処理できる。`,
        why: `データ変換に失敗したレコードは、捨てられずに S3 の <code>processing-failed</code> フォルダーに配信されます。各レコードには <code>attemptsMade</code>、<code>errorCode</code>、<code>errorMessage</code>、<code>rawData</code>、<code>lambdaARN</code> などが含まれます。「解析できないログを別の場所に残す」という要件を、コードを追加せずに満たせます。` },
      { correct: false, html: `変換用の関数では、ヘルスチェックのログを応答の <code>records</code> に含めないことで除外する。また、変換後のレコードには <code>str(uuid.uuid4())</code> で新しい <code>recordId</code> を付け、元のレコードと区別できるようにする。`,
        why: `変換後のレコードには、<strong>Firehose から渡された元の <code>recordId</code> をそのまま返す</strong>必要があります。ID が一致しないレコードは変換の失敗として扱われるため、新しい ID を付けるとすべてのレコードが <code>processing-failed</code> に送られます。レコードを除外したい場合は、応答から省くのではなく <code>result</code> を <code>Dropped</code> にして返します。` },
      { correct: false, html: `1 回の呼び出しで処理するレコードを増やすため、Lambda 用のバッファリングのヒントを 10 MB にし、関数のタイムアウトを 15 分にする。`,
        why: `Lambda 用のバッファサイズのヒントは<strong>最大 3 MB</strong>で、同期呼び出しのペイロード上限（6 MB）もあります。また、Firehose がサポートする Lambda の呼び出し時間は<strong>最大 5 分</strong>で、それを超えるとタイムアウトエラーになります（一見できそうで不可能な設定）。` },
      { correct: false, html: `Firehose から Lambda 関数を非同期で呼び出すように設定し、関数の送信先（<code>OnFailure</code>）に SQS キューを指定する。変換に失敗したレコードは SQS キューに送られる。`,
        why: `Firehose は変換用の関数を<strong>同期呼び出し</strong>で実行し、その応答を使って配信します。呼び出し方法を非同期に変更する設定はありません。また、Lambda の送信先は非同期呼び出しなどで使う機能で、Firehose のデータ変換の失敗の扱いには関係しません。` },
      { correct: false, html: `S3 の送信先でソースレコードのバックアップを有効にし、変換前の元のログをすべて分析用バケットにも保存して、マスキングで情報が失われても調査できるようにする。`,
        why: `ソースレコードのバックアップには<strong>変換前のデータ</strong>がそのまま保存されるため、マスキング前の <code>email</code> や <code>phone</code> が S3 に残ります。「PII を分析用バケットに残さない」という要件に反します。どうしても元のデータを保管する場合は、アクセスを厳しく制限した別のバケットに暗号化して保存するなどの設計が必要です。` }
    ],
    explanation: `
  <h4>Firehose のデータ変換の流れ</h4>
  <ol>
  <li>Firehose が受信データを Lambda 用にバッファリング（0.2〜3 MB / 0〜900 秒、既定 1 MB / 60 秒）。</li>
  <li>関数を<strong>同期呼び出し</strong>（要求・応答とも 6 MB まで、呼び出し時間は最大 5 分）。</li>
  <li>関数は各レコードについて <code>recordId</code> / <code>result</code>（<code>Ok</code>・<code>Dropped</code>・<code>ProcessingFailed</code>）/ <code>data</code>（Base64）を返す。</li>
  <li><code>Ok</code> のレコードを配信先のバッファリング条件に従って配信。<code>ProcessingFailed</code> や ID の不一致は S3 の <code>processing-failed</code> フォルダーへ。</li>
  </ol>
  <h4>ポイント</h4>
  <ul>
  <li>関数の呼び出し自体が失敗した場合（タイムアウトや呼び出しの上限）は、既定で 3 回再試行し、それでも失敗したバッチは処理失敗として扱われる。呼び出しのエラーは CloudWatch Logs に記録できる。</li>
  <li>PII のマスキングは「保存する前」に行うのが原則。保存後に消す設計では、一時的にでも PII が残る。</li>
  <li>ほぼリアルタイムの変換・配信が要件で、独自の消費者アプリケーションが不要なら、Kinesis Data Streams + Lambda より Firehose のデータ変換のほうが構成が少ない。</li>
  </ul>`,
    refs: [
      ["Firehose: ソースデータの変換", "https://docs.aws.amazon.com/firehose/latest/dev/data-transformation.html"],
      ["Firehose: データ変換に必要なパラメータ", "https://docs.aws.amazon.com/firehose/latest/dev/data-transformation-status-model.html"],
      ["Firehose: データ変換の失敗の処理", "https://docs.aws.amazon.com/firehose/latest/dev/data-transformation-failure-handling.html"],
      ["Firehose: アクセスの制御（Lambda によるデータ変換）", "https://docs.aws.amazon.com/firehose/latest/dev/controlling-access.html"]
    ]
  },

  /* ---------- Q2: セキュリティ（S3 の暗号化の強制） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ",
    tag: "設定の選択",
    type: "multi", pick: 2,
    text: `
  <p>ある医療系アプリケーションは、患者の検査レポート（PHI を含む）を新しく作成した S3 バケット <code>lab-reports</code> に保存する。セキュリティ部門から次の要件が示された。</p>
  <ul>
  <li>HTTPS（TLS）を使わないリクエストは、どのプリンシパルからであってもすべて拒否する。</li>
  <li>オブジェクトは、カスタマーマネージドキー <code>phi-key</code> を使った SSE-KMS で保存する。アップロードするアプリケーションが暗号化のヘッダーを指定し忘れても、この方式で暗号化される。</li>
  <li>大量の小さなオブジェクトを読み書きするため、AWS KMS へのリクエストの料金をできるだけ抑える。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `バケットポリシーに次のステートメントを追加する。
  <pre><code>{
  "Sid": "DenyInsecureTransport",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": [
    "arn:aws:s3:::lab-reports",
    "arn:aws:s3:::lab-reports/*"
  ],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}</code></pre>`,
        why: `<code>aws:SecureTransport</code> は、リクエストが TLS で送られたかどうかを表す条件キーです。値が <code>false</code> のリクエストを明示的に <code>Deny</code> すると、IAM ポリシーでどれだけ許可されていても拒否されます（明示的な拒否が常に優先）。バケット自体の操作とオブジェクトの操作の両方を対象にするため、Resource にはバケットの ARN と <code>/*</code> の両方を指定します。` },
      { correct: true, html: `バケットの既定の暗号化を、KMS キー <code>phi-key</code> を使う SSE-KMS に設定し、S3 バケットキーを有効にする。`,
        why: `既定の暗号化を設定すると、暗号化のヘッダーがないアップロードにもその方式が適用されます。S3 バケットキーを有効にすると、S3 はバケット単位の短期間のキーを KMS から取得してオブジェクトごとのデータキーを生成するため、<strong>KMS へのリクエストが大幅に減り</strong>、料金とスロットリングのリスクを抑えられます。` },
      { correct: false, html: `バケットポリシーに、<code>"Effect": "Allow"</code>、<code>"Principal": "*"</code>、条件 <code>"Bool": { "aws:SecureTransport": "true" }</code> のステートメントを追加し、HTTPS のリクエストだけを許可する。`,
        why: `<code>Allow</code> のステートメントは、条件を満たすリクエストを<strong>追加で許可するだけ</strong>で、HTTP のリクエストを拒否しません。IAM ポリシーでアクセスを許可されたプリンシパルは、引き続き HTTP でもアクセスできます。また、<code>Principal: "*"</code> の許可は、HTTPS であれば誰でもアクセスできる公開設定になってしまいます（ブロックパブリックアクセスで拒否されます）。` },
      { correct: false, html: `バケットポリシーに、<code>"Effect": "Deny"</code>、<code>"Principal": "*"</code>、<code>"Action": "s3:*"</code>、条件 <code>"Bool": { "aws:SecureTransport": "true" }</code> のステートメントを追加する。`,
        why: `条件の値が逆になっているため、<strong>HTTPS のリクエストがすべて拒否</strong>されます。AWS SDK や CLI は既定で HTTPS を使うので、アプリケーションも管理者もバケットにアクセスできなくなります。拒否すべきなのは <code>aws:SecureTransport</code> が <code>false</code> のリクエストです。` },
      { correct: false, html: `バケットの既定の暗号化を SSE-C（ユーザー指定のキー）にし、キーは Secrets Manager に保管する。アップロード時にヘッダーがなくても、S3 が Secrets Manager からキーを取得して暗号化する。`,
        why: `SSE-C は、<strong>リクエストごとにクライアントがキーを渡す</strong>方式で、バケットの既定の暗号化には設定できません（一見できそうで不可能な構成）。S3 がほかのサービスからキーを取得することもありません。さらに 2026 年 4 月以降、新しい汎用バケットでは SSE-C が既定で無効になっており、使うには明示的に有効にする必要があります。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>転送中の暗号化</strong>: バケットポリシーで <code>aws:SecureTransport = false</code> を <code>Deny</code> する。AWS Config のマネージドルール <code>s3-bucket-ssl-requests-only</code> で継続的に確認できる。</li>
  <li><strong>保管中の暗号化</strong>: すべてのバケットは既定で SSE-S3 で暗号化される。SSE-KMS にすると、キーのアクセス許可と CloudTrail による利用の記録で、きめ細かい制御と監査ができる。</li>
  <li><strong>S3 バケットキー</strong>: SSE-KMS の KMS へのリクエストを減らし、コストを下げる。CloudTrail の KMS のイベントもオブジェクト単位ではなくバケット単位になる。</li>
  <li><strong>SSE-C</strong>: キーをリクエストごとに渡す必要があり、AWS のサービスが自動で復号できない。2026 年 4 月以降、新しいバケットでは既定で無効。</li>
  <li>許可（<code>Allow</code>）では「禁止」を表現できない。要件が「必ず拒否する」なら明示的な <code>Deny</code> を使う。</li>
  </ul>`,
    refs: [
      ["Amazon S3: セキュリティのベストプラクティス", "https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html"],
      ["Amazon S3: バケットポリシーの例（HTTP / HTTPS）", "https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html"],
      ["Amazon S3: S3 バケットキーによる SSE-KMS のコスト削減", "https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html"],
      ["Amazon S3: 既定の暗号化の設定", "https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-encryption.html"]
    ]
  },

  /* ---------- Q3: デプロイ（CodeArtifact による依存関係管理） ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "アーティファクトの準備",
    type: "multi", pick: 2,
    text: `
  <p>ある開発チームは、AWS CodeBuild で Python の Lambda 関数をビルドしている。現在は <code>pip install -r requirements.txt</code> で公開の PyPI から直接パッケージを取得している。社内の方針で、次の要件が示された。</p>
  <ul>
  <li>パッケージの取得は社内で管理するリポジトリを経由し、一度取得した公開パッケージはそのリポジトリに保持する。</li>
  <li>社内の共通ライブラリ <code>acme-common</code> を同じリポジトリから取得できるようにする。</li>
  <li>CodeBuild では長期的な認証情報やトークンを保存せず、ビルドのたびに認証する。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `AWS CodeArtifact にドメイン <code>acme</code> を作成する。外部接続 <code>public:pypi</code> を持つリポジトリ <code>pypi-store</code> と、それをアップストリームに設定したリポジトリ <code>team-repo</code> を作成し、<code>acme-common</code> は <code>twine</code> で <code>team-repo</code> に公開する。`,
        why: `CodeArtifact の推奨構成は、<strong>公開リポジトリへの外部接続を持つリポジトリをドメインに 1 つ作り、ほかのリポジトリからアップストリームとして参照する</strong>ことです。<code>team-repo</code> にないパッケージは、アップストリームを経由して PyPI から取得され、CodeArtifact に保持されます。社内のパッケージは <code>twine</code> で公開し、<code>pip</code> で同じリポジトリから取得できます。` },
      { correct: true, html: `buildspec の <code>pre_build</code> フェーズで次のコマンドを実行してから <code>pip install</code> する。CodeBuild のサービスロールには <code>codeartifact:GetAuthorizationToken</code>、<code>codeartifact:ReadFromRepository</code>、<code>sts:GetServiceBearerToken</code> などを許可する。
  <pre><code>aws codeartifact login --tool pip --domain acme \\
    --domain-owner 111122223333 --repository team-repo</code></pre>`,
        why: `<code>aws codeartifact login</code> は、呼び出し元の AWS 認証情報（ここでは CodeBuild のサービスロール）で認可トークンを取得し、<code>pip</code> の <code>index-url</code> をリポジトリのエンドポイントに設定します。トークンを取得するには、<code>codeartifact:GetAuthorizationToken</code> と <code>sts:GetServiceBearerToken</code> の両方が必要です。ビルドのたびにトークンを取得するので、トークンを保存しておく必要がありません。` },
      { correct: false, html: `リポジトリ <code>team-repo</code> に外部接続 <code>public:pypi</code> と <code>public:npmjs</code> を両方追加し、フロントエンドのビルドでも同じリポジトリを使えるようにする。`,
        why: `CodeArtifact のリポジトリには、<strong>外部接続を 1 つしか追加できません</strong>（一見できそうで不可能な構成）。複数の公開リポジトリを使う場合は、外部接続ごとにリポジトリ（<code>pypi-store</code>、<code>npm-store</code> など）を作り、それらをアップストリームとして追加します。` },
      { correct: false, html: `管理者が <code>get-authorization-token --duration-seconds 2592000</code> で 30 日間有効なトークンを発行し、CodeBuild プロジェクトの環境変数に平文で設定する。月に 1 回、トークンを更新する。`,
        why: `CodeArtifact の認可トークンの有効期間は<strong>15 分〜12 時間</strong>（900〜43,200 秒）で、30 日は指定できません。また、トークンを平文の環境変数に保存することは、「長期的な認証情報やトークンを保存しない」という要件に反します。ビルドの中でサービスロールを使って取得します。` },
      { correct: false, html: `CodeBuild のサービスロールには権限を追加せず、CodeArtifact ドメインのリソースポリシーで、サービスロールに <code>sts:GetServiceBearerToken</code> と <code>codeartifact:GetAuthorizationToken</code> を許可する。`,
        why: `<code>sts:GetServiceBearerToken</code> はドメインのリソースポリシーに書いても<strong>効果がなく</strong>、呼び出し元の IAM ロール（またはユーザー）のポリシーで許可する必要があります。そのため、このままでは認可トークンを取得できません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>ドメイン</strong>: リポジトリをまとめる単位。パッケージの実体はドメインに 1 回だけ保存され、複数のリポジトリから参照される。</li>
  <li><strong>アップストリーム</strong>: リポジトリにないパッケージを、アップストリームのリポジトリから探す。外部接続はリポジトリごとに 1 つまでで、外部接続を持つリポジトリをアップストリームにするのが推奨構成。</li>
  <li><strong>認証</strong>: <code>aws codeartifact login --tool pip|twine|npm|...</code> がトークンの取得とパッケージマネージャーの設定を 1 回で行う。トークンの既定の有効期間は 12 時間。ロールを引き受けている場合は <code>--duration-seconds 0</code> でセッションの残り時間に合わせられる。</li>
  <li>Maven や Gradle などは <code>get-authorization-token</code> で取得したトークンを環境変数 <code>CODEARTIFACT_AUTH_TOKEN</code> に入れて使う。トークンをファイルやソース管理に残さない。</li>
  </ul>`,
    refs: [
      ["CodeArtifact: pip の設定と使用", "https://docs.aws.amazon.com/codeartifact/latest/ug/python-configure-pip.html"],
      ["CodeArtifact: 認証とトークン", "https://docs.aws.amazon.com/codeartifact/latest/ug/tokens-authentication.html"],
      ["CodeArtifact: 公開リポジトリへの接続", "https://docs.aws.amazon.com/codeartifact/latest/ug/external-connection.html"],
      ["CodeArtifact: CodeBuild での Python パッケージの使用", "https://docs.aws.amazon.com/codeartifact/latest/ug/using-python-packages-in-codebuild.html"]
    ]
  },

  /* ---------- Q4: トラブルシューティング（X-Ray のサンプリングルール） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化",
    tag: "設定の選択",
    type: "multi", pick: 2,
    text: `
  <p>ある EC サイトの API は、API Gateway の REST API <code>shop-api</code> の <code>prod</code> ステージ（X-Ray のアクティブトレースを有効化）から、複数の Lambda 関数を呼び出している。X-Ray のサンプリングルールは既定のルール（リザーバー 1 件/秒、固定レート 5%）だけである。</p>
  <p>注文 API（<code>POST /orders</code>）で断続的に遅延が発生しており、原因を調べたい。一方で、トレースの記録量が多く料金が増えているため、次の要件でサンプリングを見直すことになった。</p>
  <ul>
  <li>調査期間中、<code>POST /orders</code> のリクエストは<strong>すべて</strong>トレースする。</li>
  <li>それ以外のリクエストは、固定レートを 1% に下げる。</li>
  <li>アプリケーションのコードの変更や再デプロイは行わない。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `次のサンプリングルールを作成する。優先度 <code>1</code>、リザーバー <code>1</code>、レート <code>100</code>%、サービス名 <code>shop-api/prod</code>、サービスタイプ <code>*</code>、HTTP メソッド <code>POST</code>、URL パス <code>/orders</code>、ホストとリソース ARN は <code>*</code>。`,
        why: `サンプリングの判断は、リクエストを最初に受け取る X-Ray 対応のサービス（ここでは API Gateway）で行われます。API Gateway のサービス名は <code>API 名/ステージ</code> の形式です。ルールは<strong>優先度の小さい順</strong>に評価され、最初に一致したルールが使われるため、調査用のルールに小さい優先度を付けます。レート 100% なので、リザーバーを使い切った後のリクエストもすべて記録されます。` },
      { correct: true, html: `既定のルール（Default）の固定レートを 5% から 1% に変更する。`,
        why: `既定のルールは、<strong>ほかのどのルールにも一致しなかったリクエスト</strong>に適用され、リザーバーとレートを変更できます。サンプリングルールは X-Ray のサービス側で管理されるため、変更はコードの変更や再デプロイなしで反映されます。` },
      { correct: false, html: `注文を処理する Lambda 関数 <code>create-order</code> を対象に、サービス名 <code>create-order</code>、レート 100% のサンプリングルールを作成する。`,
        why: `X-Ray のサンプリングは<strong>親の判断に従う（parent-based）</strong>仕組みです。<code>create-order</code> は API Gateway から呼び出されるため、API Gateway がすでに行ったサンプリングの判断（トレースヘッダー）をそのまま引き継ぎ、この関数向けのルールは適用されません。ルールは、トレースを開始するルートのサービス（API Gateway）を対象にします。` },
      { correct: false, html: `調査用のルールを、リザーバー <code>100</code>、レート <code>0</code>% で作成する。リザーバーの件数が十分に大きいので、<code>POST /orders</code> のリクエストはすべて記録される。`,
        why: `リザーバーは「1 秒あたりに記録する件数の上限」で、<strong>ルールを使うすべてのサービスで共有</strong>されます。リクエストが毎秒 100 件を超えると、超えた分にはレート（0%）が適用されて記録されません。すべてのリクエストを確実に記録するには、レートを 100% にします。` },
      { correct: false, html: `サンプリングルールを作成・変更した後に、API Gateway の <code>prod</code> ステージを再デプロイする。ステージを再デプロイしないと、新しいルールは適用されない。`,
        why: `サンプリングルールは X-Ray のサービスで一元管理され、API Gateway や SDK は定期的にルールを取得します。<strong>ステージの再デプロイやコードの変更は不要</strong>です。ルールをコードに同梱する（ローカルのルール）方法では、変更のたびに再デプロイが必要になり、インスタンスごとにリザーバーが加算されるという問題もあります。` }
    ],
    explanation: `
  <h4>サンプリングルールの評価</h4>
  <ul>
  <li>ルールは優先度（1〜9999）の小さい順に評価され、最初に一致したルールで判断される。どれにも一致しなければ既定のルール。</li>
  <li><strong>リザーバー</strong>: 1 秒あたりに必ず記録する件数（ルールを使う全サービスで共有）。<strong>レート</strong>: リザーバーを使い切った後に記録する割合。</li>
  <li>既定のルールは「毎秒最初の 1 件 + それ以降の 5%」。</li>
  <li>一致条件: サービス名、サービスタイプ、ホスト、HTTP メソッド、URL パス、リソース ARN（ワイルドカード <code>*</code> と <code>?</code> が使える）。API Gateway ではリクエストヘッダーを属性として条件にできる。</li>
  </ul>
  <h4>ポイント</h4>
  <ul>
  <li>サンプリングの判断はトレースのルートで 1 回だけ行われ、下流のサービスはその判断に従う。ルールはエントリポイントに対して設定する。</li>
  <li>サービス側で管理するルールは、コードを変えずに変更でき、リザーバーも全インスタンスに配分される。</li>
  <li>サンプリング結果（一致件数・記録件数など）はコンソールのサンプリングのページで確認できる。</li>
  </ul>`,
    refs: [
      ["AWS X-Ray: サンプリングルールの設定", "https://docs.aws.amazon.com/xray/latest/devguide/xray-console-sampling.html"],
      ["AWS X-Ray: API Gateway のアクティブトレース", "https://docs.aws.amazon.com/xray/latest/devguide/xray-services-apigateway.html"],
      ["AWS X-Ray: X-Ray API によるサンプリングルールの使用", "https://docs.aws.amazon.com/xray/latest/devguide/xray-api-sampling.html"]
    ]
  },

  /* ---------- Q5: 開発（SNS から SQS へのファンアウト） ---------- */
  {
    id: "q5",
    domain: "分野1 開発 / 分野2 セキュリティ",
    tag: "原因の特定",
    type: "multi", pick: 2,
    text: `
  <p>注文サービスは、注文が確定すると SNS トピック <code>order-events</code> に次の JSON を発行する。</p>
  <pre><code>{"orderId": "o-123", "amount": 4800}</code></pre>
  <p>トピックには 2 つの SQS キューがサブスクライブしている（ファンアウト）。各キューのアクセスポリシーでは、プリンシパル <code>sns.amazonaws.com</code> に <code>sqs:SendMessage</code> を、条件 <code>aws:SourceArn</code> をトピックの ARN にして許可している。</p>
  <ul>
  <li><code>shipping-queue</code>（暗号化は SSE-SQS）: メッセージは届くが、このキューをトリガーとする Lambda 関数が次のコードの 2 行目で <code>KeyError: 'orderId'</code> になる。
  <pre><code>for record in event["Records"]:
    order_id = json.loads(record["body"])["orderId"]</code></pre></li>
  <li><code>billing-queue</code>（暗号化は AWS マネージドキー <code>aws/sqs</code> を使った SSE-KMS）: メッセージが 1 件も届かない。</li>
  </ul>
  <p>それぞれの問題を解決する方法として正しいものはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `<code>shipping-queue</code> のサブスクリプションで、属性 <code>RawMessageDelivery</code> を <code>true</code> にする（raw message delivery を有効にする）。`,
        why: `raw message delivery を有効にしていない場合、SQS には <code>Type</code>、<code>MessageId</code>、<code>TopicArn</code>、<code>Message</code>、<code>Timestamp</code>、署名などを含む <strong>SNS の JSON の封筒（エンベロープ）</strong>が届き、発行した本文は <code>Message</code> の中に文字列として入っています。そのため <code>orderId</code> が最上位に見つからず <code>KeyError</code> になります。raw message delivery を有効にすると、SNS のメタデータが取り除かれ、発行した本文がそのまま届きます。` },
      { correct: true, html: `<code>billing-queue</code> の暗号化をカスタマーマネージドキーに変更し、そのキーポリシーでサービスプリンシパル <code>sns.amazonaws.com</code> に <code>kms:GenerateDataKey*</code> と <code>kms:Decrypt</code> を許可する。`,
        why: `SNS が暗号化された SQS キューにメッセージを送るには、キューの KMS キーで <strong>SNS のサービスプリンシパルに <code>GenerateDataKey</code> と <code>Decrypt</code> を許可</strong>する必要があります。AWS マネージドキーのキーポリシーは変更できないため、SNS に権限を与えられず、配信が失敗します。カスタマーマネージドキーに変えて、キーポリシーにステートメントを追加します。` },
      { correct: false, html: `<code>aws/sqs</code> のキーポリシーを編集し、<code>sns.amazonaws.com</code> に <code>kms:GenerateDataKey*</code> と <code>kms:Decrypt</code> を許可するステートメントを追加する。`,
        why: `AWS マネージドキー（<code>aws/</code> で始まるエイリアスのキー）のキーポリシーは、<strong>AWS が管理しており、利用者は変更できません</strong>（一見できそうで不可能な操作）。ほかのサービスに権限を与える必要がある場合は、カスタマーマネージドキーを使います。` },
      { correct: false, html: `<code>billing-queue</code> のアクセスポリシーで、<code>sns.amazonaws.com</code> に <code>sqs:ReceiveMessage</code> と <code>sqs:DeleteMessage</code> も許可する。`,
        why: `SNS がキューに対して行うのは <code>sqs:SendMessage</code> だけで、受信や削除の権限は不要です。<code>SendMessage</code> はすでに許可されており、届かない原因は KMS キーの権限にあるため、この変更では解決しません。` },
      { correct: false, html: `<code>shipping-queue</code> の Lambda 関数のコードを次のように変更する。raw message delivery は無効のままにする。
  <pre><code>for record in event["Records"]:
    order_id = record["messageAttributes"]["orderId"]["stringValue"]</code></pre>`,
        why: `発行した JSON の本文は SQS のメッセージ属性には変換されません。メッセージ属性に入るのは、発行時に <code>MessageAttributes</code> として指定した値だけです（しかも raw message delivery が無効なら、それらも封筒の JSON の中に入ります）。raw message delivery を使わない場合は、<code>json.loads(json.loads(record["body"])["Message"])</code> のように封筒の <code>Message</code> を取り出して解析します。` },
      { correct: false, html: `SNS トピックのサーバー側の暗号化を無効にする。トピックが暗号化されていると、暗号化された SQS キューには配信できない。`,
        why: `トピックの暗号化とキューの暗号化は独立しており、暗号化されたトピックから暗号化されたキューにも配信できます。<code>billing-queue</code> に届かない原因は、<strong>キューの KMS キーで SNS に権限がない</strong>ことです。トピックの暗号化を無効にすると、保管中の保護が弱まるだけです。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>ファンアウト</strong>: SNS トピックに複数の SQS キューをサブスクライブし、1 回の発行で複数のコンシューマーに非同期で配信する。各キューのアクセスポリシーで、トピック（<code>aws:SourceArn</code>）からの <code>sqs:SendMessage</code> を許可する。</li>
  <li><strong>raw message delivery</strong>: SQS / HTTP(S) / Firehose のサブスクリプションで使える。有効にすると本文がそのまま届く。SQS では、SNS のメッセージ属性が SQS のメッセージ属性として届く（最大 10 個）。</li>
  <li><strong>暗号化されたキュー</strong>: キューのキーはカスタマーマネージドキーにし、キーポリシーで <code>sns.amazonaws.com</code> に <code>kms:GenerateDataKey*</code> と <code>kms:Decrypt</code> を許可する。SSE-SQS（SQS 管理のキー）なら追加の設定は不要。</li>
  <li>配信の失敗は、トピックの CloudWatch メトリクス <code>NumberOfNotificationsFailed</code> や配信ステータスのログで確認できる。サブスクリプションに DLQ を設定すると、配信できなかったメッセージを残せる。</li>
  </ul>`,
    refs: [
      ["Amazon SNS: raw message delivery", "https://docs.aws.amazon.com/sns/latest/dg/sns-large-payload-raw-message-delivery.html"],
      ["Amazon SNS: SQS キューの SNS トピックへのサブスクライブ", "https://docs.aws.amazon.com/sns/latest/dg/subscribe-sqs-queue-to-sns-topic.html"],
      ["Amazon SNS: 暗号化された SQS キューのサブスクリプション", "https://docs.aws.amazon.com/sns/latest/dg/sns-enable-encryption-for-topic-sqs-queue-subscriptions.html"],
      ["AWS KMS: AWS マネージドキー", "https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html"]
    ]
  }
  ]
});
