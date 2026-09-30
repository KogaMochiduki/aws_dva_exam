/* DVA-C02 模擬試験 Day 008 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "008",
  date: "2026-09-30",
  title: "DynamoDB トランザクション・TTL・Streams・Cognito client credentials・CodeBuild buildspec・CloudFront キャッシュポリシー・RDS Proxy",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・4 横断） ---------- */
  {
    id: "q1",
    domain: "分野1 開発 / 分野4 トラブルシューティングと最適化",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>あるイベントのチケット販売サイトでは、ユーザーが座席を選ぶと 10 分間の<strong>仮押さえ</strong>を作り、その間に決済を完了させる。データは 2 つの DynamoDB テーブルで管理している。</p>
  <ul>
  <li><code>Seats</code>: パーティションキー <code>eventId</code>、ソートキー <code>seatId</code>。仮押さえ中は <code>heldBy</code>（仮押さえ ID）と <code>heldUntil</code>（期限）を持つ。</li>
  <li><code>Holds</code>: パーティションキー <code>holdId</code>。<code>userId</code>、<code>seatId</code>、<code>expiresAt</code> を持つ。</li>
  </ul>
  <p>仮押さえ API（Lambda、Python）は、クライアントが送る <code>Idempotency-Key</code> ヘッダーの値を <code>holdId</code> として使う。要件は次のとおりである。</p>
  <ul>
  <li>座席の更新と仮押さえの作成は、<strong>両方成功するか両方失敗する</strong>。同じ座席を 2 人が同時に仮押さえすることはできない。</li>
  <li>クライアントがタイムアウトして同じ <code>Idempotency-Key</code> で再送しても、仮押さえは二重に作られない。</li>
  <li>期限切れの仮押さえは、書き込みキャパシティを消費せずに自動で削除する。削除されるまでの間も、期限切れの仮押さえを有効なものとして扱ってはならない。</li>
  <li>期限切れで自動削除された仮押さえだけを Amazon S3 に保存して分析に使う。ユーザーのキャンセルでアプリケーションが削除した仮押さえは含めない。関数の不要な呼び出しは避ける。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `仮押さえ API を次のように実装する。
  <pre><code>now = int(time.time())
exp = now + 600
try:
    ddb.transact_write_items(TransactItems=[
        {"Update": {
            "TableName": "Seats",
            "Key": {"eventId": {"S": event_id}, "seatId": {"S": seat_id}},
            "UpdateExpression": "SET heldBy = :h, heldUntil = :exp",
            "ConditionExpression":
                "attribute_not_exists(heldUntil) OR heldUntil &lt; :now",
            "ExpressionAttributeValues": {
                ":h": {"S": hold_id}, ":exp": {"N": str(exp)},
                ":now": {"N": str(now)}},
        }},
        {"Put": {
            "TableName": "Holds",
            "Item": {"holdId": {"S": hold_id}, "userId": {"S": user_id},
                     "seatId": {"S": seat_id}, "expiresAt": {"N": str(exp)}},
            "ConditionExpression": "attribute_not_exists(holdId)",
        }},
    ])
except ddb.exceptions.TransactionCanceledException as e:
    codes = [r["Code"] for r in e.response["CancellationReasons"]]
    if codes[1] == "ConditionalCheckFailed":   # 同じキーで仮押さえ済み（再送）
        return existing_hold(hold_id)
    if codes[0] == "ConditionalCheckFailed":   # 他のユーザーが仮押さえ中
        return {"statusCode": 409}
    raise</code></pre>`,
        why: `<code>TransactWriteItems</code> は、最大 100 件の書き込みアクションをすべて成功させるか、すべて失敗させます。座席の条件式は「仮押さえされていない、または期限が過ぎている」場合だけ更新を許すため、同時に仮押さえされても一方だけが成功します。期限切れの判定を TTL の削除に頼らず、<code>heldUntil</code> と現在時刻の比較で行っているのもポイントです。<code>Holds</code> への <code>Put</code> には <code>attribute_not_exists(holdId)</code> を付けているので、同じ <code>Idempotency-Key</code> で再送されるとトランザクション全体が取り消されます。<code>CancellationReasons</code> はアクションと同じ順番で返されるため、どの条件で失敗したかを判別して、既存の仮押さえを返すか 409 を返すかを決められます。` },
      { correct: false, html: `書き込み回数を減らすため、<code>batch_write_item</code> で <code>Seats</code> の更新と <code>Holds</code> の作成をまとめて送信する。<code>Seats</code> のリクエストには条件式 <code>attribute_not_exists(heldUntil) OR heldUntil &lt; :now</code> を指定し、<code>UnprocessedItems</code> があれば再送する。`,
        why: `<code>BatchWriteItem</code> で行えるのは <code>PutRequest</code> と <code>DeleteRequest</code> だけで、<strong>項目の更新も、個々のリクエストへの条件式の指定もできません</strong>（一見できそうで不可能な実装）。また、個々の書き込みはアトミックですがバッチ全体はアトミックではないため、一部だけが成功する可能性があります。複数の項目をまとめて条件付きで書き込むにはトランザクションを使います。` },
      { correct: true, html: `<code>Holds</code> テーブルで TTL を有効にし、TTL 属性に <code>expiresAt</code>（エポック秒の Number 型）を指定する。<code>Holds</code> を読み取る処理では、<code>FilterExpression</code> で <code>expiresAt &gt; :now</code> の項目だけを返すようにする。`,
        why: `TTL を使うと、期限切れの項目が書き込みスループットを消費せずに自動で削除されます。ただし、削除は期限の直後ではなく、通常は<strong>期限から数日以内</strong>に行われます。削除されるまでの間は読み取りの結果に含まれるので、フィルター式やアプリケーションのロジックで期限切れの項目を除外する必要があります。` },
      { correct: false, html: `<code>Holds</code> テーブルで TTL を有効にし、TTL 属性 <code>expiresAt</code> には人が読みやすいように ISO 8601 形式の文字列（例: <code>"2026-10-01T10:15:00Z"</code>）を保存する。`,
        why: `TTL の属性は <strong>Number 型のエポック秒</strong>でなければなりません。Number 型ではない TTL 属性を持つ項目は、TTL の処理で<strong>無視され</strong>、いつまでも削除されません（一見できそうで実際には機能しない構成）。` },
      { correct: true, html: `<code>Holds</code> テーブルで DynamoDB Streams（ビュータイプ <code>OLD_IMAGE</code>）を有効にし、アーカイブ用の Lambda 関数のイベントソースマッピングに次のフィルター条件を設定する。関数は <code>OldImage</code> を S3 に保存する。
  <pre><code>{
  "eventName": ["REMOVE"],
  "userIdentity": {
    "type": ["Service"],
    "principalId": ["dynamodb.amazonaws.com"]
  }
}</code></pre>`,
        why: `TTL で削除された項目は、ユーザーによる削除ではなく<strong>サービスによる削除</strong>としてストリームに出力され、<code>userIdentity.type</code> が <code>Service</code>、<code>principalId</code> が <code>dynamodb.amazonaws.com</code> になります。イベントソースマッピングのフィルター条件でこれに一致するレコードだけを関数に渡すと、アプリケーションによる削除や更新のレコードでは関数が呼び出されず、無駄な呼び出しと料金を減らせます。<code>OLD_IMAGE</code> にしておけば、削除前の項目の内容を取得できます。` },
      { correct: false, html: `座席の条件式は <code>attribute_not_exists(heldBy)</code> だけにする。<code>Holds</code> の TTL で期限切れの仮押さえが削除されたら、ストリームで起動する Lambda 関数が <code>Seats</code> の <code>heldBy</code> と <code>heldUntil</code> を削除して座席を解放する。TTL は期限の時刻に削除を行うので、座席は 10 分後に解放される。`,
        why: `TTL による削除は期限の時刻ちょうどには行われず、<strong>数日後になることもあります</strong>。この設計では、仮押さえの期限が切れても座席が長時間解放されず、他のユーザーが購入できません。期限の判定は、条件式で <code>heldUntil</code> と現在時刻を比較して行う必要があります。` },
      { correct: false, html: `TTL で削除された項目は DynamoDB Streams に出力されないため、EventBridge Scheduler で 1 分ごとに Lambda 関数を起動し、<code>Holds</code> テーブルをスキャンして期限切れの項目を S3 に保存してから削除する。`,
        why: `TTL で削除された項目は、ストリームにサービスによる削除として<strong>出力されます</strong>。前提が誤っているうえに、1 分ごとのスキャンはテーブル全体の読み込みキャパシティを消費し、アプリケーションによる削除には書き込みキャパシティもかかります。「書き込みキャパシティを消費せずに自動で削除する」という要件も満たせません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <p>この問題は「データストアの使用とデータライフサイクルの管理（分野1）」「ストリーム処理（分野1）」「不要な呼び出しを減らす最適化（分野4）」を横断しています。</p>
  <ul>
  <li><strong>トランザクション</strong>: <code>TransactWriteItems</code> は最大 100 アクション（<code>Put</code> / <code>Update</code> / <code>Delete</code> / <code>ConditionCheck</code>）をすべて成功させるか、すべて失敗させる。同じ項目を 1 つのトランザクションで 2 回操作することはできない。各項目に準備とコミットの 2 回分のキャパシティがかかる。失敗時は <code>TransactionCanceledException</code> の <code>CancellationReasons</code> で原因を判別する。</li>
  <li><strong>冪等性</strong>: SDK の再試行に対しては <code>ClientRequestToken</code>（10 分間有効）が使える。クライアントからの再送に対しては、業務上の一意キーを使った条件付き書き込みで重複を防ぐ。</li>
  <li><strong>TTL</strong>: 属性は Number 型のエポック秒。削除は通常、期限から数日以内で、書き込みキャパシティを消費しない。削除までは読み取りに現れるので、フィルター式などで除外する。</li>
  <li><strong>TTL の削除とストリーム</strong>: サービスによる削除（<code>userIdentity.principalId = dynamodb.amazonaws.com</code>）として記録される。イベントフィルタリングで対象のレコードだけを処理できる。</li>
  </ul>`,
    refs: [
      ["DynamoDB: トランザクションの仕組み", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html"],
      ["DynamoDB: Time to Live（TTL）", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html"],
      ["DynamoDB: 期限切れの項目と TTL の操作", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ttl-expired-items.html"],
      ["DynamoDB API: BatchWriteItem", "https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html"],
      ["Lambda: イベントフィルタリング", "https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html"]
    ]
  },

  /* ---------- Q2: セキュリティ（マシン間の認証） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ",
    tag: "クロスサービス認証",
    type: "single", pick: 1,
    text: `
  <p>ある会社の受注 API は、Amazon Cognito ユーザープールのオーソライザーを設定した API Gateway の REST API で提供されている。これまでは、ユーザーがサインインして取得したトークンだけで呼び出されていた。</p>
  <p>新たに、社内の在庫連携バッチ（コンテナで動くサービス）から、ユーザーの操作なしで <code>GET /orders</code> を呼び出す必要がある。要件は次のとおりである。</p>
  <ul>
  <li>バッチ用に Cognito のユーザーを作成したり、ユーザーのパスワードを保存したりしない。</li>
  <li>バッチに許可するのは受注の<strong>読み取りだけ</strong>とし、API 側でその権限を検証する。</li>
  </ul>
  <p>この要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `ユーザープールにリソースサーバー <code>orders</code> とカスタムスコープ <code>orders/read</code> を定義する。クライアントシークレットを持ち、client credentials グラントだけを許可したアプリクライアントを作成し、バッチはトークンエンドポイントからアクセストークンを取得して <code>Authorization</code> ヘッダーで送る。API の <code>GET /orders</code> メソッドには、認可スコープとして <code>orders/read</code> を設定する。`,
        why: `client credentials グラントは、ユーザーを介さないマシン間の認可のための OAuth 2.0 のフローです。クライアント ID とクライアントシークレットでトークンエンドポイントに要求すると、カスタムスコープを含む<strong>アクセストークン</strong>が発行されます。API Gateway の Cognito オーソライザーでメソッドに認可スコープを設定すると、トークンはアクセストークンとして扱われ、トークンのスコープとメソッドのスコープが一致する場合だけ呼び出しが許可されます。` },
      { correct: false, html: `client credentials グラントを許可したアプリクライアントを作成し、バッチはトークンエンドポイントから <strong>ID トークン</strong>を取得して <code>Authorization</code> ヘッダーで送る。API のメソッドには認可スコープを設定しない。`,
        why: `client credentials グラントで発行されるのは<strong>アクセストークンだけ</strong>で、ID トークンは発行されません（一見できそうで不可能な構成）。ID トークンはユーザーの認証結果を表すもので、ユーザーのいないマシン間の通信では使いません。また、スコープを設定しないと、読み取りだけに権限を絞ることもできません。` },
      { correct: false, html: `バッチ用の IAM ユーザーを作成して Cognito ユーザープールに追加し、IAM ユーザーのアクセスキーで Cognito にサインインしてトークンを取得する。`,
        why: `Cognito ユーザープールに <strong>IAM ユーザーを追加することはできません</strong>（一見できそうで不可能な構成）。ユーザープールのユーザーと IAM のプリンシパルは別のものです。長期的なアクセスキーを発行することも、セキュリティの観点から避けるべきです。` },
      { correct: false, html: `API キーを作成して使用量プランに関連付け、<code>GET /orders</code> メソッドで API キーを必須にする。バッチは <code>x-api-key</code> ヘッダーに API キーを付けて呼び出し、Cognito オーソライザーはこのメソッドから外す。`,
        why: `API キーは、使用量プランによるスロットリングやクォータの管理のためのもので、<strong>認証や認可の手段として使わないよう</strong> AWS のドキュメントでも注意されています。キーを知っていれば誰でも呼び出せ、スコープのような権限の範囲も表せません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>OAuth 2.0 のグラント</strong>: 認可コードグラント（ユーザーのサインイン。ID・アクセス・リフレッシュトークンを取得できる）、client credentials グラント（マシン間。アクセストークンのみ）。client credentials は、認可コードや暗黙的グラントと同じアプリクライアントでは有効にできず、クライアントシークレットが必要。</li>
  <li><strong>リソースサーバーとカスタムスコープ</strong>: <code>リソースサーバー識別子/スコープ名</code> の形式で、API ごとの権限を表す。</li>
  <li><strong>API Gateway の Cognito オーソライザー</strong>: メソッドに認可スコープを設定しない場合は ID トークン、設定した場合はアクセストークンとして検証する。</li>
  <li><strong>API キー</strong>: 使用量プランでクライアントごとの呼び出し量を管理するためのもの。認可には Cognito、IAM、Lambda オーソライザーを使う。</li>
  </ul>`,
    refs: [
      ["Cognito: OAuth 2.0 のグラント", "https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints-oauth-grants.html"],
      ["Cognito: スコープ、M2M、リソースサーバー", "https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html"],
      ["API Gateway: REST API と Cognito ユーザープールの統合", "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-enable-cognito-user-pool.html"],
      ["API Gateway: 使用量プランと API キー", "https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html"]
    ]
  },

  /* ---------- Q3: デプロイ（CodeBuild の buildspec） ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "ビルド設定",
    type: "multi", pick: 2,
    text: `
  <p>開発チームは、AWS CodePipeline のビルドステージで AWS CodeBuild を使い、AWS SAM アプリケーションをビルドしている。要件は次のとおりである。</p>
  <ul>
  <li>依存パッケージの取得には、社内のプライベート npm レジストリのトークンが必要である。トークンは AWS Secrets Manager のシークレット <code>ci/npm</code>（JSON キー <code>token</code>）に保存されており、buildspec やビルドプロジェクトの設定に平文で書いてはならない。</li>
  <li>ユニットテストの結果（JUnit XML 形式の <code>reports/junit.xml</code>）を CodeBuild のテストレポートとして表示する。</li>
  <li>後続のデプロイステージで使うため、パッケージ済みのテンプレート <code>packaged.yaml</code> を出力アーティファクトにする。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `buildspec を次のようにする。
  <pre><code>version: 0.2
env:
  secrets-manager:
    NPM_TOKEN: ci/npm:token
phases:
  install:
    runtime-versions:
      nodejs: 20
  pre_build:
    commands:
      - npm config set //npm.example.internal/:_authToken "$NPM_TOKEN"
      - npm ci
  build:
    commands:
      - npm test
      - sam build
      - sam package --s3-bucket "$ARTIFACT_BUCKET" --output-template-file packaged.yaml
reports:
  unit-tests:
    files:
      - reports/junit.xml
    file-format: JUNITXML
artifacts:
  files:
    - packaged.yaml</code></pre>`,
        why: `<code>env</code> の <code>secrets-manager</code> に <code>環境変数名: シークレットID:JSONキー</code> の形式で書くと、ビルドの開始時に Secrets Manager から値を取得して環境変数に設定します。値はビルドログでマスクされます。<code>reports</code> に JUnit XML のファイルを指定するとテストレポートが作成され、<code>artifacts</code> の <code>files</code> に指定したファイルが出力アーティファクトとして後続のステージに渡されます。` },
      { correct: true, html: `CodeBuild プロジェクトのサービスロールに、シークレット <code>ci/npm</code> への <code>secretsmanager:GetSecretValue</code> を許可する（シークレットをカスタマーマネージドキーで暗号化している場合は、そのキーへの <code>kms:Decrypt</code> も許可する）。`,
        why: `buildspec の <code>secrets-manager</code> や <code>parameter-store</code> の値は、CodeBuild が<strong>ビルドプロジェクトのサービスロール</strong>の権限で取得します。サービスロールに権限がないと、ビルドの開始時にシークレットを取得できずに失敗します。` },
      { correct: false, html: `buildspec の <code>env</code> を次のようにする。ほかの部分は正解の buildspec と同じにする。
  <pre><code>env:
  variables:
    NPM_TOKEN: "npm_Abc123..."</code></pre>`,
        why: `<code>variables</code> の値は平文で、buildspec をリポジトリに置けば誰でも読めます。CodeBuild のドキュメントでも、機密情報を <code>variables</code> に保存しないよう強く推奨されており、<code>parameter-store</code> や <code>secrets-manager</code> を使うよう案内されています。` },
      { correct: false, html: `CodePipeline のサービスロールに <code>secretsmanager:GetSecretValue</code> を許可し、パイプラインが取得したシークレットの値を CodeBuild に渡す。`,
        why: `buildspec のシークレットを取得するのは CodeBuild で、使われるのは CodeBuild プロジェクトのサービスロールです。パイプラインのサービスロールに権限を付けても、ビルドのシークレット取得には効きません。` },
      { correct: false, html: `テストレポートを表示するため、<code>reports</code> セクションは使わず、<code>artifacts</code> の <code>files</code> に <code>reports/junit.xml</code> を追加する。`,
        why: `<code>artifacts</code> に指定したファイルは、出力アーティファクト（S3 に保存される ZIP など）に含まれるだけで、テストレポートにはなりません。CodeBuild のテストレポートを作成するには、<code>reports</code> セクションでレポートグループ、ファイル、形式を指定します。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>buildspec の構成</strong>: <code>version</code>（0.2 を推奨）、<code>env</code>、<code>phases</code>（<code>install</code> / <code>pre_build</code> / <code>build</code> / <code>post_build</code>）、<code>reports</code>、<code>artifacts</code>、<code>cache</code>。</li>
  <li><strong>環境変数</strong>: <code>variables</code> は平文。機密情報は <code>parameter-store</code>（SecureString）か <code>secrets-manager</code> を使う。取得にはサービスロールの権限が必要で、値はログでマスクされる。<code>exported-variables</code> で後続のパイプラインのアクションに値を渡せる。</li>
  <li><strong>レポート</strong>: JUnit XML、NUnit、TestNG、Cucumber JSON などのテストレポートと、JaCoCo、Cobertura などのカバレッジレポートに対応する。</li>
  <li>buildspec はソースのルートに <code>buildspec.yml</code> として置くのが既定だが、別の名前や場所も指定できる。</li>
  </ul>`,
    refs: [
      ["CodeBuild: buildspec のリファレンス", "https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html"],
      ["CodeBuild: テストレポート", "https://docs.aws.amazon.com/codebuild/latest/userguide/test-reporting.html"],
      ["CodeBuild: サービスロールの設定", "https://docs.aws.amazon.com/codebuild/latest/userguide/setting-up-service-role.html"]
    ]
  },

  /* ---------- Q4: 最適化（CloudFront のキャッシュキー） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化",
    tag: "キャッシュの最適化",
    type: "single", pick: 1,
    text: `
  <p>ある EC サイトは、Amazon CloudFront ディストリビューションの背後にある Application Load Balancer で商品ページを配信している。商品ページは <code>Accept-Language</code> ヘッダーに応じて日本語か英語で返される。</p>
  <p>CloudFront のキャッシュビヘイビアは、レガシーのキャッシュ設定で「すべてのヘッダーをオリジンに転送する」ようになっており、キャッシュヒット率がほぼ 0% で、オリジンの負荷が高い。オリジンは分析のために視聴者の国コード（<code>CloudFront-Viewer-Country</code> ヘッダー）も受け取る必要がある。</p>
  <p>要件は次のとおりである。</p>
  <ul>
  <li>言語ごとに正しいページをキャッシュして返す。</li>
  <li>国コードはオリジンに渡すが、国ごとにキャッシュを分けない。</li>
  </ul>
  <p>キャッシュヒット率を上げつつ要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `キャッシュビヘイビアに、<code>Accept-Language</code> ヘッダーをキャッシュキーに含めるキャッシュポリシーと、<code>CloudFront-Viewer-Country</code> ヘッダーをオリジンへのリクエストに含めるオリジンリクエストポリシーを設定する。`,
        why: `キャッシュポリシーでキャッシュキーに含めたヘッダーは、オリジンへのリクエストにも自動で含まれます。一方、オリジンリクエストポリシーで指定した値は、<strong>キャッシュキーには含まれずに</strong>オリジンにだけ渡されます。言語はキャッシュキーに、国コードはオリジンリクエストポリシーに分けることで、言語ごとに正しくキャッシュしながら、国コードでキャッシュが細分化されるのを防げます。` },
      { correct: false, html: `キャッシュポリシーで、<code>Accept-Language</code> と <code>CloudFront-Viewer-Country</code> の両方のヘッダーをキャッシュキーに含める。オリジンリクエストポリシーは設定しない。`,
        why: `国コードもキャッシュキーに含まれるため、同じ言語のページでも国ごとに別々のオブジェクトとしてキャッシュされます。キャッシュが細分化されてヒット率が下がり、「国ごとにキャッシュを分けない」という要件にも反します。` },
      { correct: false, html: `キャッシュポリシーではヘッダーをキャッシュキーに含めず、オリジンリクエストポリシーで <code>Accept-Language</code> と <code>CloudFront-Viewer-Country</code> の両方をオリジンに転送する。`,
        why: `<code>Accept-Language</code> がキャッシュキーに含まれないため、最初にキャッシュされた言語のページが、別の言語を要求したユーザーにも返されてしまいます。レスポンスの内容を変える値は、キャッシュキーに含める必要があります。` },
      { correct: false, html: `レガシーのキャッシュ設定のまま、すべてのヘッダーを転送する設定を維持し、最小 TTL と既定の TTL を 1 日に延ばす。`,
        why: `すべてのヘッダーを転送する設定にすると、CloudFront はオブジェクトを実質的にキャッシュしません。TTL を延ばしてもヒット率は上がりません。キャッシュキーには、レスポンスを変えるのに必要な値だけを含めるのが原則です。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>キャッシュポリシー</strong>: キャッシュキーに含めるヘッダー・Cookie・クエリ文字列と TTL を定義する。キャッシュキーに含めた値はオリジンにも渡される。</li>
  <li><strong>オリジンリクエストポリシー</strong>: キャッシュキーに含めずにオリジンに渡す値を定義する。<code>CloudFront-Viewer-Country</code> などの CloudFront が付けるヘッダーもここで追加できる。</li>
  <li><strong>ヒット率を上げるコツ</strong>: キャッシュキーの値は必要最小限にする。<code>Accept-Language</code> は <code>ja,en-US;q=0.9</code> のように値の種類が多いので、CloudFront Functions などで <code>ja</code> / <code>en</code> に正規化するとさらにヒット率が上がる。</li>
  <li>マネージドポリシー（<code>CachingOptimized</code>、<code>AllViewer</code> など）も用意されている。</li>
  </ul>`,
    refs: [
      ["CloudFront: キャッシュキーの制御", "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html"],
      ["CloudFront: ポリシーによるオリジンリクエストの制御", "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-origin-requests.html"],
      ["CloudFront: CloudFront のリクエストヘッダーの追加", "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html"]
    ]
  },

  /* ---------- Q5: 開発（Lambda からの RDS 接続） ---------- */
  {
    id: "q5",
    domain: "分野1 開発 / 分野4 トラブルシューティングと最適化",
    tag: "Lambda とプライベートリソース",
    type: "multi", pick: 2,
    text: `
  <p>VPC に接続した Lambda 関数（Python）が、同じ VPC のプライベートサブネットにある Amazon RDS for MySQL に接続して注文を登録している。関数のハンドラーは、呼び出しのたびに DB に接続し、処理が終わると接続を閉じている。DB のユーザー名とパスワードは関数の環境変数に保存している。</p>
  <p>セール中にアクセスが急増すると、関数のログに <code>Too many connections</code> エラーが大量に記録され、DB の CPU 使用率も接続の確立処理で高くなる。要件は次のとおりである。</p>
  <ul>
  <li>関数の同時実行数が増えても、DB への接続数を抑えて安定して処理する。</li>
  <li>DB のパスワードを関数の設定に保存しない。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `DB と同じ VPC に Amazon RDS Proxy を作成し、DB の認証情報を Secrets Manager のシークレットとして登録する。プロキシでは IAM 認証を必須にし、関数の実行ロールにプロキシへの <code>rds-db:connect</code> を許可する。関数は IAM 認証トークンを生成して、プロキシのエンドポイントに接続する。`,
        why: `RDS Proxy は DB への接続をプールして共有するため、関数の同時実行数が急増しても DB への接続数を抑えられます。すぐに処理できない接続はキューに入れたりスロットリングしたりして、DB が過負荷になるのを防ぎます。プロキシから DB への接続には Secrets Manager の認証情報が使われ、関数からプロキシへは IAM 認証を使えるので、関数の設定にパスワードを保存する必要がありません。` },
      { correct: true, html: `DB への接続をハンドラーの外（初期化処理）で作成して、同じ実行環境での後続の呼び出しで再利用する。接続が切れていた場合だけ再接続する。`,
        why: `ハンドラーの外で作成したオブジェクトは、同じ実行環境が再利用される間は保持されます。呼び出しのたびに接続を確立・切断すると、DB 側で接続の確立処理（認証や TLS のハンドシェイク）が繰り返され、CPU を消費します。接続を再利用すると、DB の負荷と関数の実行時間の両方を減らせます。` },
      { correct: false, html: `関数の予約済み同時実行数を引き上げて、セール中の急増に備えて多くの実行環境で並行して処理できるようにする。`,
        why: `同時実行数が増えると、実行環境ごとに DB への接続が作られるため、<strong>接続数はむしろ増えます</strong>。<code>Too many connections</code> が悪化するだけです。同時実行数で DB を保護したい場合は、予約済み同時実行数を上限として<strong>低く</strong>設定する使い方になります。` },
      { correct: false, html: `RDS Proxy をパブリックアクセス可能として作成し、Lambda 関数を VPC から切り離してインターネット経由でプロキシに接続する。VPC への接続によるコールドスタートの遅延もなくなる。`,
        why: `RDS Proxy は DB と同じ VPC 内にだけ作成でき、<strong>パブリックアクセス可能にはできません</strong>（一見できそうで不可能な構成）。プロキシに接続するクライアントは、同じ VPC（またはピアリングなどで接続されたネットワーク）から接続する必要があります。` },
      { correct: false, html: `ハンドラーの中で、処理のたびに接続を開いたらすぐに閉じる処理を徹底し、接続を保持する時間をできるだけ短くする。`,
        why: `現在の実装がまさにこの方法で、呼び出しのたびに接続の確立と切断が行われています。急増時には確立処理が集中して DB の CPU を消費し、同時実行数分の接続が同時に存在するので、接続数の問題も解決しません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>Lambda と RDB</strong>: Lambda は同時実行数に応じて実行環境が増えるため、RDB の接続数の上限にすぐ達しやすい。RDS Proxy で接続をプールし、関数では接続を初期化処理で作って再利用する。</li>
  <li><strong>RDS Proxy の認証</strong>: プロキシから DB への接続には Secrets Manager の認証情報（または IAM 認証）を使う。クライアントからプロキシへの接続には IAM 認証を必須にできる（<code>rds-db:connect</code>）。</li>
  <li><strong>RDS Proxy の制約</strong>: DB と同じ VPC に作成し、パブリックアクセスはできない。リードレプリカではなく書き込み用のインスタンスに関連付ける。</li>
  <li><strong>VPC 内の Lambda</strong>: 関数はサブネットとセキュリティグループを指定して VPC に接続する。インターネットや AWS のサービスへのアクセスには、NAT ゲートウェイや VPC エンドポイントが必要になる。</li>
  </ul>`,
    refs: [
      ["Amazon RDS Proxy", "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html"],
      ["Amazon RDS Proxy: IAM 認証の設定", "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-iam-setup.html"],
      ["Lambda: 関数から Amazon RDS データベースへのアクセス", "https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html"],
      ["Lambda: 関数を使う際のベストプラクティス", "https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html"]
    ]
  }
  ]
});
