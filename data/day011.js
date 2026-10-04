/* DVA-C02 模擬試験 Day 011 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "011",
  date: "2026-10-04",
  title: "HTTP API の JWT オーソライザーとテナント分離・KMS キーローテーション・samconfig.toml の環境切り替え・SQS イベントソースの最大同時実行数・DynamoDB の数値シリアライズ",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・2 横断） ---------- */
  {
    id: "q1",
    domain: "分野2 セキュリティ / 分野1 開発",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>ある会社は、複数の企業（テナント）が利用する請求書管理の SaaS を開発している。構成は次のとおりである。</p>
  <ul>
  <li>API: Amazon API Gateway の HTTP API（Lambda プロキシ統合、ペイロード形式バージョン 2.0）。ルートは <code>GET /invoices</code> と <code>POST /invoices</code>。</li>
  <li>認証: Amazon Cognito ユーザープール（Essentials 機能プラン）。各ユーザーにはカスタム属性 <code>custom:tenant_id</code> が設定されている。リソースサーバー <code>invoice-api</code> にカスタムスコープ <code>invoice-api/read</code> と <code>invoice-api/write</code> を定義し、クライアントはトークンエンドポイントから取得した<strong>アクセストークン</strong>を <code>Authorization</code> ヘッダーで送る。</li>
  <li>データ: DynamoDB テーブル <code>Invoices</code>（パーティションキー <code>tenantId</code>、ソートキー <code>invoiceId</code>）。</li>
  </ul>
  <p>要件は次のとおりである。</p>
  <ul>
  <li>トークンの署名や有効期限を検証するコードは書かず、API Gateway の機能で検証する。</li>
  <li><code>POST /invoices</code> は <code>invoice-api/write</code> スコープを持つトークンだけ、<code>GET /invoices</code> は <code>invoice-api/read</code> スコープを持つトークンだけが呼び出せる。</li>
  <li>Lambda 関数は呼び出し元のテナントのデータにだけアクセスする。テナント ID は、クライアントが改ざんできない値から取得する。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>3 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `HTTP API に JWT オーソライザーを作成する。発行者（Issuer）を <code>https://cognito-idp.ap-northeast-1.amazonaws.com/&lt;ユーザープール ID&gt;</code>、オーディエンス（Audience）をアプリクライアント ID にする。<code>POST /invoices</code> の認可スコープを <code>invoice-api/write</code>、<code>GET /invoices</code> の認可スコープを <code>invoice-api/read</code> にする。`,
        why: `JWT オーソライザーは、発行者の <code>jwks_uri</code> から公開鍵を取得してトークンの署名を検証し、<code>iss</code>、<code>exp</code>、<code>nbf</code>、<code>iat</code> などのクレームを確認します。Cognito のアクセストークンには通常 <code>aud</code> がなく、代わりに <code>client_id</code> が入っています。API Gateway は <code>aud</code> がない場合に <code>client_id</code> をオーディエンスと照合するため、アプリクライアント ID を指定します。ルートに認可スコープを設定すると、トークンの <code>scope</code> にそのいずれかが含まれていることも確認されます。` },
      { correct: true, html: `ユーザープールにトークン生成前の Lambda トリガーを、イベントバージョン <code>V2_0</code>（アクセストークンのカスタマイズあり）で設定する。関数では次のようにユーザー属性の値をアクセストークンのクレームに追加する。
  <pre><code>def handler(event, context):
    tenant = event["request"]["userAttributes"]["custom:tenant_id"]
    event["response"]["claimsAndScopeOverrideDetails"] = {
        "accessTokenGeneration": {
            "claimsToAddOrOverride": {"tenant_id": tenant}
        }
    }
    return event</code></pre>`,
        why: `カスタム属性（<code>custom:</code>）は ID トークンには含まれますが、<strong>アクセストークンには既定では含まれません</strong>。Essentials または Plus 機能プランのユーザープールでは、トークン生成前トリガーのイベントバージョン <code>V2_0</code> で、アクセストークンにクレームを追加できます。値は Cognito が保持するユーザー属性から取るため、クライアントは改ざんできません（ユーザー自身が属性を書き換えられないよう、アプリクライアントの書き込み権限から <code>custom:tenant_id</code> を外しておきます）。` },
      { correct: true, html: `Lambda 関数では、オーソライザーが検証したクレームからテナント ID を取得し、パーティションキーを指定して <code>Query</code> する。
  <pre><code>def handler(event, context):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    tenant = claims["tenant_id"]
    res = table.query(
        KeyConditionExpression=Key("tenantId").eq(tenant)
    )
    return {"statusCode": 200, "body": json.dumps(res["Items"], default=str)}</code></pre>`,
        why: `HTTP API の JWT オーソライザーは、検証したトークンのクレームを統合先に渡します。ペイロード形式 2.0 では <code>event["requestContext"]["authorizer"]["jwt"]["claims"]</code> で参照できます。署名検証済みのクレームから取ったテナント ID でパーティションキーを指定するので、ほかのテナントの項目は読み取れません。` },
      { correct: false, html: `Lambda 関数では、クライアントが送るクエリ文字列 <code>?tenantId=...</code> の値でパーティションキーを指定して <code>Query</code> する。JWT オーソライザーで認証済みのユーザーからのリクエストなので、値は信頼できる。`,
        why: `JWT オーソライザーが保証するのは「トークンが有効であること」だけで、<strong>クエリ文字列の値は検証しません</strong>。認証済みのユーザーが <code>tenantId</code> をほかのテナントの値に書き換えれば、そのテナントのデータを読み取れてしまいます（テナント間のデータ漏えい）。テナント ID は、検証済みのトークンのクレームから取得します。` },
      { correct: false, html: `HTTP API に Cognito ユーザープールオーソライザー（タイプ <code>COGNITO_USER_POOLS</code>）を作成し、テナントごとに API キーと使用量プランを発行して、テナント単位でアクセスを制御する。`,
        why: `<code>COGNITO_USER_POOLS</code> タイプのオーソライザー、API キー、使用量プランは、<strong>REST API だけの機能</strong>です（一見できそうで不可能な構成）。HTTP API で Cognito を使う場合は JWT オーソライザーを使います。また、API キーはクライアントの識別や使用量の制限のためのもので、認可の仕組みとして使うべきではありません。` },
      { correct: false, html: `Lambda 関数では、REST API の Cognito オーソライザーと同じく、次のようにクレームを取得する。
  <pre><code>claims = event["requestContext"]["authorizer"]["claims"]
tenant = claims["tenant_id"]</code></pre>`,
        why: `<code>requestContext.authorizer.claims</code> は、<strong>REST API の Cognito ユーザープールオーソライザー</strong>を使った場合の場所です。HTTP API の JWT オーソライザー（ペイロード形式 2.0）では <code>requestContext.authorizer.jwt.claims</code> に入るため、このコードは <code>KeyError</code> で失敗します。` },
      { correct: false, html: `<code>POST /invoices</code> の認可スコープに <code>invoice-api/read</code> と <code>invoice-api/write</code> の両方を設定し、「読み取りと書き込みの両方の権限を持つトークンだけが POST できる」ようにする。`,
        why: `ルートに複数の認可スコープを設定した場合、トークンには<strong>そのうち少なくとも 1 つ</strong>が含まれていればよい（OR 条件）ので、<code>invoice-api/read</code> だけを持つトークンでも <code>POST</code> できてしまいます。書き込みを制限するには、<code>POST</code> のルートに <code>invoice-api/write</code> だけを設定します。` }
    ],
    explanation: `
  <h4>JWT オーソライザーが確認すること（HTTP API）</h4>
  <ul>
  <li><code>kid</code> と発行者の <code>jwks_uri</code> の公開鍵による署名（RSA 系のアルゴリズムのみ）</li>
  <li><code>iss</code> = 設定した Issuer、<code>aud</code>（なければ <code>client_id</code>）= 設定した Audience のいずれか</li>
  <li><code>exp</code> / <code>nbf</code> / <code>iat</code> の時刻</li>
  <li>ルートに認可スコープがあれば、<code>scope</code>（または <code>scp</code>）にそのいずれかが含まれること</li>
  </ul>
  <h4>ポイント</h4>
  <ul>
  <li>ID トークンとアクセストークンは形式上区別できないため、AWS はルートに認可スコープを設定することを推奨している（スコープを持つのはアクセストークンだけ）。</li>
  <li>アクセストークンにテナント ID などの独自のクレームを入れるには、トークン生成前トリガーの <code>V2_0</code>（ユーザー）または <code>V3_0</code>（M2M も含む）を使う。Essentials / Plus 機能プランが必要。</li>
  <li>REST API と HTTP API の違い: API キー・使用量プラン・リクエスト検証・キャッシュ・AWS WAF・プライベートエンドポイントは REST API だけ。JWT オーソライザーは HTTP API だけ（REST API で JWT を検証するには Cognito オーソライザーか Lambda オーソライザーを使う）。</li>
  <li>マルチテナントでは、テナント ID を<strong>サーバー側で検証済みの値</strong>から取得し、パーティションキーに含めて分離する。</li>
  </ul>`,
    refs: [
      ["API Gateway: HTTP API の JWT オーソライザー", "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html"],
      ["API Gateway: REST API と HTTP API の選択", "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html"],
      ["Cognito: アクセストークンについて", "https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html"],
      ["Cognito: トークン生成前の Lambda トリガー", "https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-token-generation.html"],
      ["API Gateway: HTTP API の Lambda プロキシ統合（ペイロード形式）", "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html"]
    ]
  },

  /* ---------- Q2: セキュリティ（KMS キーローテーション） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ",
    tag: "設定の選択",
    type: "multi", pick: 2,
    text: `
  <p>ある会社のアプリケーションでは、次の 3 つの AWS KMS キーを使っている。</p>
  <ul>
  <li><strong>キー A</strong>: カスタマーマネージドキー（対称暗号化キー、キーマテリアルのオリジンは <code>AWS_KMS</code>）。S3 バケットの SSE-KMS とアプリケーションのエンベロープ暗号化に使っている。</li>
  <li><strong>キー B</strong>: カスタマーマネージドキー（非対称 RSA キー、署名と検証用）。API の応答に付けるデジタル署名に使っている。</li>
  <li><strong>キー C</strong>: カスタマーマネージドキー（対称暗号化キー、キーマテリアルはインポート、オリジンは <code>EXTERNAL</code>）。</li>
  </ul>
  <p>セキュリティ部門から「キー A のキーマテリアルを 180 日ごとに自動でローテーションすること」「キー B も年に 1 回は新しい鍵にすること」という要件が示された。</p>
  <p>これらのキーのローテーションについて、正しい説明はどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `キー A は <code>aws kms enable-key-rotation --key-id &lt;キー A&gt; --rotation-period-in-days 180</code> で自動ローテーションを有効にできる。ローテーション後もキー ID とキー ARN は変わらず、以前に暗号化したデータもアプリケーションの変更や再暗号化なしで復号できる。`,
        why: `自動ローテーションは、オリジンが <code>AWS_KMS</code> の対称暗号化キーで使えます。ローテーション期間は <strong>90〜2,560 日</strong>の範囲で指定でき、省略すると 365 日です。ローテーションで変わるのは「現在のキーマテリアル」だけで、キー ID・ARN・キーポリシーは同じです。KMS は以前のキーマテリアルをすべて保持しており、復号時には暗号化に使ったキーマテリアルを自動で選びます。` },
      { correct: true, html: `キー B は自動ローテーションに対応していないため、新しい非対称キーを作成し、署名に使うエイリアスを新しいキーに付け替える（手動ローテーション）。検証する側には新しい公開鍵を配布し、移行期間中は古い公開鍵でも検証できるようにしておく。`,
        why: `非対称キー、HMAC キー、カスタムキーストアのキーは、自動ローテーションもオンデマンドローテーションもできません。新しいキーを作成して切り替える<strong>手動ローテーション</strong>を行います。アプリケーションがエイリアスでキーを指定していれば、エイリアスの付け替えだけでコードを変えずに切り替えられます。古い署名を検証するため、古い公開鍵はすぐには破棄しません。` },
      { correct: false, html: `キー C も、キー A と同じく <code>enable-key-rotation</code> で 365 日ごとの自動ローテーションを有効にできる。KMS が新しいキーマテリアルを生成してインポートする。`,
        why: `インポートしたキーマテリアル（オリジン <code>EXTERNAL</code>）のキーは、<strong>自動ローテーションに対応していません</strong>（一見できそうで不可能な構成）。KMS はキーマテリアルを生成しないため、新しいキーマテリアルを自分でインポートしてから、オンデマンドローテーションを実行します。` },
      { correct: false, html: `キー A のローテーション後は、古いキーマテリアルが削除されるため、S3 のオブジェクトやアプリケーションのデータを新しいキーマテリアルで再暗号化するバッチ処理を、ローテーション前に用意しておく必要がある。`,
        why: `オリジンが <code>AWS_KMS</code> のキーでは、<strong>キーを削除するまですべてのキーマテリアルが保持されます</strong>。古いデータはそのまま復号できるため、再暗号化は不要です。また、ローテーションはキーが生成したデータキーを変更しないので、データキーそのものが漏えいした場合の対策にはなりません。` },
      { correct: false, html: `S3 の既定の暗号化に使っている AWS マネージドキー <code>aws/s3</code> も、<code>enable-key-rotation</code> でローテーション期間を 180 日に変更して、キー A と同じ周期にそろえる。`,
        why: `AWS マネージドキーのローテーションは、<strong>AWS が約 1 年ごとに自動で行い</strong>、有効・無効の切り替えや期間の変更はできません。ローテーション期間を自分で決める必要がある場合は、カスタマーマネージドキーを使います。` },
      { correct: false, html: `キー A のローテーションを実行すると、キー ARN が新しい値に変わる。アプリケーションの設定はキー ARN ではなくエイリアスで指定しておけば、エイリアスが自動で新しい ARN に付け替えられる。`,
        why: `自動ローテーションやオンデマンドローテーションでは、<strong>キー ID とキー ARN は変わりません</strong>。同じ論理リソースのまま、キーマテリアルだけが新しくなります。エイリアスの付け替えが必要なのは、新しいキーを作成する手動ローテーションの場合です（その場合もエイリアスは自分で付け替えます）。` }
    ],
    explanation: `
  <h4>キーの種類とローテーション</h4>
  <table style="border-collapse:collapse;width:100%;font-size:0.92em">
  <tr><th style="border:1px solid #ccc;padding:4px 8px;text-align:left">キー</th><th style="border:1px solid #ccc;padding:4px 8px;text-align:left">自動</th><th style="border:1px solid #ccc;padding:4px 8px;text-align:left">オンデマンド</th><th style="border:1px solid #ccc;padding:4px 8px;text-align:left">手動（新しいキーに切り替え）</th></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px">対称暗号化キー（<code>AWS_KMS</code>）</td><td style="border:1px solid #ccc;padding:4px 8px">○（90〜2,560 日、既定 365 日）</td><td style="border:1px solid #ccc;padding:4px 8px">○</td><td style="border:1px solid #ccc;padding:4px 8px">○</td></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px">対称暗号化キー（インポート、<code>EXTERNAL</code>）</td><td style="border:1px solid #ccc;padding:4px 8px">×</td><td style="border:1px solid #ccc;padding:4px 8px">○（新しいキーマテリアルをインポートしてから）</td><td style="border:1px solid #ccc;padding:4px 8px">○</td></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px">非対称キー / HMAC キー / カスタムキーストアのキー</td><td style="border:1px solid #ccc;padding:4px 8px">×</td><td style="border:1px solid #ccc;padding:4px 8px">×</td><td style="border:1px solid #ccc;padding:4px 8px">○</td></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px">AWS マネージドキー</td><td style="border:1px solid #ccc;padding:4px 8px">毎年 AWS が実施（変更不可）</td><td style="border:1px solid #ccc;padding:4px 8px">×</td><td style="border:1px solid #ccc;padding:4px 8px">－</td></tr>
  </table>
  <h4>ポイント</h4>
  <ul>
  <li>ローテーションはキーマテリアルだけを替え、キー ID・ARN・ポリシーは変わらない。復号は暗号化に使ったキーマテリアルで自動的に行われる。</li>
  <li>ローテーションの記録は、CloudTrail の <code>RotateKey</code> イベントと EventBridge の <code>KMS CMK Rotation</code> イベントで確認できる。</li>
  <li>マルチリージョンキーでは、ローテーションの設定と実行はプライマリキーで行い、レプリカキーに同期される。</li>
  </ul>`,
    refs: [
      ["AWS KMS: キーのローテーション", "https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html"],
      ["AWS KMS: 自動キーローテーションの有効化", "https://docs.aws.amazon.com/kms/latest/developerguide/rotating-keys-enable.html"],
      ["AWS KMS: キーの手動ローテーション", "https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys-manually.html"],
      ["AWS KMS: オンデマンドキーローテーション", "https://docs.aws.amazon.com/kms/latest/developerguide/rotating-keys-on-demand.html"]
    ]
  },

  /* ---------- Q3: デプロイ（samconfig.toml の環境切り替え） ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "設定の選択",
    type: "single", pick: 1,
    text: `
  <p>開発者は、AWS SAM で管理している注文処理アプリケーションを、1 つの <code>template.yaml</code> からステージング環境と本番環境にデプロイしたい。テンプレートには <code>Stage</code> と <code>LogLevel</code> のパラメータがある。要件は次のとおりである。</p>
  <ul>
  <li>ステージングと本番は別々の CloudFormation スタック（<code>orders-stg</code> と <code>orders-prod</code>）にする。</li>
  <li>ステージングは <code>LogLevel=DEBUG</code>、本番は <code>LogLevel=WARN</code> でデプロイする。</li>
  <li>本番へのデプロイ時だけ、変更セットの内容を確認してから実行する。</li>
  <li>開発者やパイプラインは、環境名を 1 つ指定するだけで正しい設定でデプロイできる。</li>
  </ul>
  <p>要件を満たす設定とコマンドはどれですか。</p>`,
    options: [
      { correct: true, html: `<pre><code># samconfig.toml
version = 0.1

[stg.deploy.parameters]
stack_name = "orders-stg"
region = "ap-northeast-1"
capabilities = "CAPABILITY_IAM"
resolve_s3 = true
parameter_overrides = "Stage=stg LogLevel=DEBUG"

[prod.deploy.parameters]
stack_name = "orders-prod"
region = "ap-northeast-1"
capabilities = "CAPABILITY_IAM"
resolve_s3 = true
confirm_changeset = true
parameter_overrides = "Stage=prod LogLevel=WARN"</code></pre>
  <pre><code>$ sam build
$ sam deploy --config-env stg    # 本番は --config-env prod</code></pre>`,
        why: `SAM CLI の設定ファイルは「環境 → コマンド → parameters」の階層で、オプション名のハイフンをアンダースコアに置き換えて書きます。<code>--config-env</code> で使う環境を選び、省略すると <code>default</code> 環境が使われます。環境ごとにスタック名とパラメータを分けているので、同じテンプレートから別々のスタックが作られます。<code>confirm_changeset = true</code> は <code>prod</code> 環境にだけ書いているので、本番だけ変更セットの確認が求められます。` },
      { correct: false, html: `<code>samconfig.toml</code> に <code>[stg.deploy.parameters]</code> と <code>[prod.deploy.parameters]</code> を作成し、それぞれにスタック名と <code>parameter_overrides</code> を設定する。次のコマンドでデプロイする。
  <pre><code>$ sam deploy --stage stg</code></pre>`,
        why: `<code>sam deploy</code> に <strong><code>--stage</code> というオプションはありません</strong>（一見できそうで不可能な操作）。設定ファイルの環境を選ぶオプションは <code>--config-env</code> です。存在しないオプションを指定すると、SAM CLI はエラーで終了します。` },
      { correct: false, html: `<pre><code># samconfig.toml
version = 0.1

[default.deploy.parameters]
stack_name = "orders"
region = "ap-northeast-1"
capabilities = "CAPABILITY_IAM"
resolve_s3 = true</code></pre>
  <pre><code>$ sam deploy --parameter-overrides Stage=stg LogLevel=DEBUG
$ sam deploy --parameter-overrides Stage=prod LogLevel=WARN --confirm-changeset</code></pre>`,
        why: `どちらのコマンドも同じスタック <code>orders</code> を更新するため、ステージングと本番が<strong>別々のスタックになりません</strong>。ステージングのデプロイで本番のリソースが <code>Stage=stg</code> の設定に置き換わってしまいます。また、環境ごとの値をコマンドで毎回指定する必要があり、「環境名を 1 つ指定するだけ」という要件も満たしません。` },
      { correct: false, html: `<code>samconfig.toml</code> に <code>[stg.deploy.parameters]</code> と <code>[prod.deploy.parameters]</code> を作成し、それぞれにスタック名と <code>parameter_overrides</code> を設定する。SAM CLI は Git の現在のブランチ名と同じ名前の環境を自動で選ぶので、<code>stg</code> ブランチや <code>prod</code> ブランチをチェックアウトして <code>sam deploy</code> を実行するだけでよい。`,
        why: `SAM CLI に、<strong>Git のブランチ名から環境を選ぶ機能はありません</strong>。<code>--config-env</code> を省略すると <code>default</code> 環境が使われますが、この設定ファイルには <code>default</code> 環境がないため、スタック名などが決まらず、意図したデプロイになりません。ブランチごとに環境を切り替えたい場合は、パイプライン側でブランチに応じて <code>--config-env</code> を指定します。` }
    ],
    explanation: `
  <h4>samconfig.toml のポイント</h4>
  <ul>
  <li>既定のファイル名は <code>samconfig.toml</code>（テンプレートと同じディレクトリ）。<code>samconfig.yaml</code> も使え、<code>--config-file</code> で別のファイルも指定できる。</li>
  <li>構造は <code>[環境.コマンド.parameters]</code>。コマンド名やオプション名のスペースとハイフンはアンダースコアにする（例: <code>local_start_api</code>、<code>stack_name</code>）。全コマンド共通の値は <code>[環境.global.parameters]</code> に書く。</li>
  <li>既定の環境名は <code>default</code>。ほかの環境は <code>--config-env</code> で選ぶ。</li>
  <li>優先順位: コマンドラインの値 &gt; 設定ファイルのコマンド別の値 &gt; 設定ファイルの <code>global</code> の値。<code>parameter_overrides</code> の値はテンプレートの <code>Parameters</code> の既定値より優先される。</li>
  <li><code>sam deploy --guided</code> で入力した値は、指定した環境として設定ファイルに保存できる。</li>
  </ul>`,
    refs: [
      ["AWS SAM: SAM CLI の設定ファイル", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-config.html"],
      ["AWS SAM: sam deploy", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-deploy.html"],
      ["AWS SAM: SAM CLI の設定", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-configure.html"]
    ]
  },

  /* ---------- Q4: 最適化（SQS イベントソースの最大同時実行数） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化 / 分野1 開発",
    tag: "メトリクスの解釈",
    type: "multi", pick: 2,
    text: `
  <p>ある Lambda 関数は、SQS 標準キュー <code>orders-queue</code> のイベントソースマッピングでメッセージを処理し、同時接続数に上限のある社内のデータベースに書き込んでいる。データベースを保護するため、開発者は関数の<strong>予約済み同時実行数を 10</strong> に設定した。キューには <code>maxReceiveCount</code> が 3 のリドライブポリシーで DLQ が設定されている。</p>
  <p>セールの開始直後にメッセージが急増したところ、次の状況になった。</p>
  <ul>
  <li>関数の <code>Throttles</code> メトリクスが大きく増加した。</li>
  <li>関数のログにはエラーが 1 件も出ていないのに、DLQ にメッセージが移動している。</li>
  <li>キューの <code>ApproximateAgeOfOldestMessage</code> が増え続けている。</li>
  </ul>
  <p>この状況の説明と、データベースを保護したまま問題を解消する方法として正しいものはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `イベントソースマッピングのポーラーはキューのメッセージ量に応じて関数の呼び出し数を増やすが、予約済み同時実行数の 10 を超えた呼び出しはスロットリングされる。スロットリングされたメッセージは可視性タイムアウトの後にキューに戻って受信回数が増えるため、関数のエラーがなくても <code>maxReceiveCount</code> に達して DLQ に移動する。`,
        why: `SQS のイベントソースマッピングは、メッセージが多いと同時呼び出し数を 1 分あたり最大 300 ずつ増やします。ポーラーは関数の予約済み同時実行数を考慮せずにスケールするため、上限を超えた呼び出しはスロットリングされます。Lambda はスロットリングされた呼び出しを、バックオフしながら<strong>可視性タイムアウトが切れるまで</strong>再試行しますが、それまでに処理できなかったメッセージはキューに再び表示されます。SQS では<strong>受信のたびに受信回数が増える</strong>ので、コードのエラーがなくても <code>maxReceiveCount</code> に達して DLQ に移動することがあります。` },
      { correct: true, html: `イベントソースマッピングの最大同時実行数（<code>ScalingConfig</code> の <code>MaximumConcurrency</code>）を 10 に設定し、関数の予約済み同時実行数はそれ以上（10 以上）に保つ。`,
        why: `最大同時実行数は、イベントソースが呼び出せる関数の同時実行数を<strong>イベントソース側で制限</strong>する設定です。ポーラーが上限を超えて呼び出さないため、スロットリングによってメッセージがキューに戻ることがなくなります。予約済み同時実行数とは独立した設定で、AWS は予約済み同時実行数を、関数のすべての SQS イベントソースの最大同時実行数の合計以上にすることを推奨しています。` },
      { correct: false, html: `最大同時実行数を 1 に設定して、メッセージを 1 件ずつ順番に処理する。予約済み同時実行数は 10 のままにする。`,
        why: `SQS イベントソースの最大同時実行数に設定できるのは<strong>2〜1,000</strong> で、1 は指定できません（一見できそうで不可能な設定）。また、同時実行数を必要以上に下げると処理が追いつかず、<code>ApproximateAgeOfOldestMessage</code> がさらに増えます。` },
      { correct: false, html: `アカウントの同時実行数のクォータ（既定値 1,000）に達したことがスロットリングの原因なので、Service Quotas でクォータの引き上げを申請する。`,
        why: `この関数の同時実行数は、<strong>予約済み同時実行数の 10</strong> で頭打ちになっています。アカウントのクォータに達していなくても、予約済み同時実行数を超えた呼び出しはスロットリングされます。クォータを引き上げても、この関数の上限は 10 のままです。` },
      { correct: false, html: `Lambda は、スロットリングされた SQS のメッセージを関数が実行できるようになるまで、期限なく内部で再試行し続ける。キューに戻ることはないので、DLQ に移動しているのは関数が例外を握りつぶしているためであり、コードのエラー処理を見直す。`,
        why: `Lambda がスロットリングされたメッセージを再試行するのは、<strong>そのメッセージの可視性タイムアウトが切れるまで</strong>です。切れた時点で Lambda はそのメッセージの処理をやめ、メッセージはキューに再び表示されて、次の受信で受信回数が増えます。ログにエラーがないことと <code>Throttles</code> の増加から、スロットリングが原因と判断できます。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>SQS のスケーリング</strong>: 標準キューでは、メッセージがあると 5 つの同時呼び出しから始め、1 分あたり最大 300 ずつ増やす。1 つのイベントソースマッピングの上限は既定で 1,250。</li>
  <li><strong>最大同時実行数</strong>（イベントソースの設定、2〜1,000）と<strong>予約済み同時実行数</strong>（関数の設定）は独立している。下流のリソースを保護しつつスロットリングを避けるには、最大同時実行数で呼び出し数を制限し、予約済み同時実行数はその合計以上にする。</li>
  <li>複数のキューを 1 つの関数に接続している場合は、キューごとに最大同時実行数を設定して、1 つのキューが同時実行数を使い切るのを防げる。</li>
  <li><strong>スロットリング時の動き</strong>: Lambda はイベントソースマッピングの同時実行数を徐々に減らしながら、可視性タイムアウトが切れるまで再試行する。切れるとメッセージはキューに再び表示される。DLQ への移動は「受信回数」で判断されるため、スロットリングでも DLQ に移動しうる。</li>
  <li>プロビジョンドモード（ポーラー数の最小・最大を指定）は、最大同時実行数と同時には使えない。</li>
  </ul>`,
    refs: [
      ["Lambda: SQS イベントソースマッピングのスケーリング", "https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html"],
      ["Lambda: SQS のエラー処理", "https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html"],
      ["Lambda: 予約済み同時実行数の設定", "https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html"]
    ]
  },

  /* ---------- Q5: 開発（DynamoDB の数値のシリアライズ） ---------- */
  {
    id: "q5",
    domain: "分野1 開発",
    tag: "疑似コード",
    type: "single", pick: 1,
    text: `
  <p>ある Lambda 関数（Python、boto3 の DynamoDB リソース API）は、API Gateway から受け取った次のような JSON を DynamoDB テーブル <code>Products</code> に保存し、保存した項目を JSON で返す。</p>
  <pre><code>{"productId": "p-100", "name": "USB ケーブル", "price": 19.99, "stock": 120}</code></pre>
  <p>要件は次のとおりである。</p>
  <ul>
  <li><code>price</code> と <code>stock</code> は DynamoDB の<strong>数値型（N）</strong>で保存し、<code>price &gt; :min</code> のような数値の比較に使えるようにする。</li>
  <li>価格は、入力された値（<code>19.99</code>）から誤差なく保存する。</li>
  <li>レスポンスの JSON では、<code>price</code> と <code>stock</code> を数値として返す。</li>
  </ul>
  <p>要件を満たす正しい実装はどれですか。</p>`,
    options: [
      { correct: true, html: `<pre><code>import json
from decimal import Decimal

def to_json(o):
    if isinstance(o, Decimal):
        return int(o) if o == o.to_integral_value() else float(o)
    raise TypeError

def handler(event, context):
    item = json.loads(event["body"], parse_float=Decimal)
    table.put_item(Item=item)
    return {"statusCode": 201,
            "body": json.dumps(item, default=to_json, ensure_ascii=False)}</code></pre>`,
        why: `boto3 は Python の <code>float</code> を DynamoDB の数値として受け付けず、<code>Decimal</code> を使う必要があります。<code>json.loads</code> の <code>parse_float=Decimal</code> を使うと、JSON の文字列 <code>"19.99"</code> から直接 <code>Decimal('19.99')</code> が作られるため、2 進数の浮動小数点数を経由せず誤差が生じません。<code>Decimal</code> は標準の <code>json.dumps</code> でシリアライズできないため、<code>default</code> 関数で整数または数値に変換して返しています。` },
      { correct: false, html: `<pre><code>def handler(event, context):
    item = json.loads(event["body"])
    table.put_item(Item=item)
    return {"statusCode": 201, "body": json.dumps(item)}</code></pre>`,
        why: `<code>json.loads</code> は既定で <code>19.99</code> を <code>float</code> に変換します。boto3 のシリアライザーは <code>float</code> を受け付けないため、<code>put_item</code> で <strong><code>TypeError: Float types are not supported. Use Decimal types instead.</code></strong> が発生します。` },
      { correct: false, html: `<pre><code>def handler(event, context):
    item = json.loads(event["body"])
    item["price"] = Decimal(item["price"])   # float から Decimal に変換
    table.put_item(Item=item)
    return {"statusCode": 201, "body": json.dumps(item, default=str)}</code></pre>`,
        why: `<code>Decimal(19.99)</code> のように <code>float</code> から変換すると、2 進数の誤差を含んだ <code>19.989999999999998436...</code>（約 50 桁）という値になります。boto3 は DynamoDB の数値の精度（38 桁）に合わせ、丸めが発生する値を <strong><code>decimal.Inexact</code> 例外</strong>で拒否するため、書き込みに失敗します。また、<code>default=str</code> では数値が文字列として返されます。` },
      { correct: false, html: `<pre><code>def handler(event, context):
    item = json.loads(event["body"])
    item["price"] = str(item["price"])   # "19.99" の文字列として保存
    item["stock"] = str(item["stock"])
    table.put_item(Item=item)
    return {"statusCode": 201, "body": json.dumps(item)}</code></pre>`,
        why: `書き込みは成功しますが、属性は<strong>文字列型（S）</strong>で保存されます。文字列の比較は辞書順なので、<code>price &gt; :min</code> では <code>"100.00"</code> が <code>"9.99"</code> より小さいと判定されるなど、数値として正しく比較できません。レスポンスでも文字列として返されるため、要件を満たしません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li>DynamoDB の数値型（N）は最大 38 桁の精度を持つ。API 上は文字列として送受信され、各 SDK が言語の型に変換する。</li>
  <li>boto3 の <code>TypeSerializer</code> は <code>int</code> と <code>Decimal</code> を数値型に変換し、<code>float</code> は拒否する。丸めや誤差が発生する <code>Decimal</code> も例外になる。</li>
  <li>読み取った数値は <code>Decimal</code> で返されるため、JSON にするときは <code>json.dumps</code> の <code>default</code> で変換する（<code>Object of type Decimal is not JSON serializable</code> を防ぐ）。</li>
  <li>Java の DynamoDB 拡張クライアントなど、ほかの SDK にもオブジェクトと項目を相互に変換する仕組み（マッパー）がある。</li>
  </ul>`,
    refs: [
      ["DynamoDB: サポートされるデータ型", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.NamingRulesDataTypes.html"],
      ["Boto3: DynamoDB の項目の操作", "https://boto3.amazonaws.com/v1/documentation/api/latest/guide/dynamodb.html"],
      ["DynamoDB: 比較演算子と関数のリファレンス", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html"]
    ]
  }
  ]
});
