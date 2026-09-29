/* DVA-C02 模擬試験 Day 007 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "007",
  date: "2026-09-30",
  title: "WebSocket API によるプッシュ通知・SDK の認証情報チェーン・API Gateway カスタムドメイン・CloudWatch アラーム・SAM のテスト",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・2・4 横断） ---------- */
  {
    id: "q1",
    domain: "分野1 開発 / 分野2 セキュリティ / 分野4 トラブルシューティングと最適化",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>ある配送サービスでは、注文の配送状況が変わるたびに、ブラウザで注文画面を開いているユーザーへ<strong>ほぼリアルタイムで</strong>通知したい。開発者は次の構成を設計している。</p>
  <ul>
  <li>API Gateway の WebSocket API（API ID <code>abc123</code>、ステージ <code>prod</code>、リージョン <code>ap-northeast-1</code>）に、ブラウザが接続する。</li>
  <li>配送状況は DynamoDB テーブル <code>OrderStatus</code> に書き込まれる。DynamoDB Streams をトリガーとする Lambda 関数 <code>notify</code> が、注文したユーザーの接続に通知を送る。</li>
  <li>接続情報は DynamoDB テーブル <code>Connections</code>（パーティションキー <code>connectionId</code>、GSI <code>userId-index</code>）で管理する。</li>
  </ul>
  <p>要件は次のとおりである。</p>
  <ul>
  <li>接続時に、ユーザーが Cognito で取得した JWT を検証し、未認証の接続は拒否する。ブラウザ標準の WebSocket API は任意のリクエストヘッダーを設定できない。</li>
  <li><code>notify</code> 関数には、接続中のクライアントへのメッセージ送信に必要な最小限の権限だけを付ける。</li>
  <li>ブラウザを閉じるなどして切断済みになった接続への送信が失敗しても、処理を止めずに古い接続情報を削除する。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `<code>$connect</code> ルートに Lambda REQUEST オーソライザーを設定し、ID ソースをクエリ文字列 <code>route.request.querystring.token</code> にする。オーソライザーは JWT を検証して <code>context</code> に <code>userId</code> を返す。<code>$connect</code> の統合関数は <code>requestContext</code> の <code>connectionId</code> とオーソライザーの <code>userId</code> を <code>Connections</code> に保存し、<code>$disconnect</code> の統合関数は該当する項目を削除する。`,
        why: `WebSocket API の Lambda オーソライザーは <code>$connect</code> ルートに設定し、接続を確立するときに一度だけ認可します。ブラウザの WebSocket API はカスタムヘッダーを送れないため、トークンはクエリ文字列で渡すのが一般的です。オーソライザーが返した <code>context</code> は統合側で参照できるので、接続 ID とユーザーを対応付けて保存できます。WebSocket の接続は API Gateway が保持し、アプリケーション側は接続 ID を外部のデータストアで管理します。` },
      { correct: false, html: `<code>$connect</code> ではなく、メッセージを受け取る <code>$default</code> ルートと各カスタムルートに Lambda オーソライザーを設定し、クライアントからのメッセージごとに JWT を検証する。`,
        why: `WebSocket API で Lambda オーソライザーを設定できるのは <strong><code>$connect</code> ルートだけ</strong>です（一見できそうで不可能な構成）。接続後のメッセージごとの認可はできないので、接続時に認可し、必要ならアプリケーション側で接続とユーザーの対応を使って確認します。` },
      { correct: true, html: `<code>notify</code> 関数を次のように実装する。
  <pre><code>mgmt = boto3.client(
    "apigatewaymanagementapi",
    endpoint_url="https://abc123.execute-api.ap-northeast-1.amazonaws.com/prod",
)

def push(user_id, payload):
    items = conns.query(
        IndexName="userId-index",
        KeyConditionExpression=Key("userId").eq(user_id),
    )["Items"]
    for item in items:
        try:
            mgmt.post_to_connection(
                ConnectionId=item["connectionId"],
                Data=json.dumps(payload).encode(),
            )
        except mgmt.exceptions.GoneException:
            conns.delete_item(Key={"connectionId": item["connectionId"]})</code></pre>`,
        why: `バックエンドからクライアントに送信するには、API Gateway Management API の <code>PostToConnection</code>（<code>POST @connections/{connectionId}</code>）を、<code>https://{api-id}.execute-api.{region}.amazonaws.com/{stage}</code> をエンドポイントとして呼び出します。切断済みの接続に送ると <code>GoneException</code>（410）になるので、それを捕捉して古い接続情報を削除し、残りの接続への送信を続けます。` },
      { correct: false, html: `<code>notify</code> 関数で、API Gateway Management API のクライアントを次のように作成し、<code>post_to_connection</code> を呼び出す。例外処理は行わず、失敗した場合は DynamoDB Streams の再試行に任せる。
  <pre><code>mgmt = boto3.client(
    "apigatewaymanagementapi",
    endpoint_url="wss://abc123.execute-api.ap-northeast-1.amazonaws.com/prod",
)</code></pre>`,
        why: `<code>wss://</code> はクライアントが WebSocket 接続に使う URL です。<code>@connections</code> API は SigV4 で署名する HTTPS の API なので、エンドポイントは <code>https://</code> で指定します。また、<code>GoneException</code> を処理しないと、切断済みの接続が 1 つあるだけでバッチ全体が失敗して再試行が繰り返され、ストリームの処理が止まります。` },
      { correct: true, html: `<code>notify</code> 関数の実行ロールに、次のポリシーを付ける。
  <pre><code>{
  "Effect": "Allow",
  "Action": "execute-api:ManageConnections",
  "Resource": "arn:aws:execute-api:ap-northeast-1:111122223333:abc123/prod/POST/@connections/*"
}</code></pre>`,
        why: `<code>@connections</code> API へのアクセスは <code>execute-api:ManageConnections</code> アクションで制御されます。リソース ARN を対象の API ID・ステージ・<code>POST/@connections</code> に限定すると、他の API やステージの接続には送信できない最小権限になります。` },
      { correct: false, html: `<code>notify</code> 関数の実行ロールに、<code>arn:aws:execute-api:ap-northeast-1:111122223333:abc123/prod/*</code> への <code>execute-api:Invoke</code> を許可する。`,
        why: `<code>execute-api:Invoke</code> は、クライアントが API のルート（WebSocket ではメッセージの送信）を呼び出すための権限です。<code>@connections</code> API でクライアントにメッセージを送るには <code>execute-api:ManageConnections</code> が必要で、この権限だけでは <code>PostToConnection</code> が拒否されます。` },
      { correct: false, html: `<code>$connect</code> の統合関数で、接続 ID とユーザー ID をモジュールレベルのディクショナリに保存する。<code>notify</code> 関数は同じディクショナリを参照して送信先の接続 ID を取得する。DynamoDB の読み書きが不要になり、遅延も小さくなる。`,
        why: `Lambda 関数は<strong>ステートレス</strong>に設計する必要があります。メモリ上の変数は実行環境ごとに独立しており、別の関数（<code>notify</code>）から参照することはできません。同じ関数でも、実行環境が増えたり再作成されたりすると内容が失われます。複数の関数やインスタンスで共有する状態は、DynamoDB などの外部ストアに置きます。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <p>この問題は「API と SDK を使ったコード・ステートレスな設計（分野1）」「認可と最小権限（分野2）」「サービス統合のエラーのデバッグ（分野4）」を横断しています。</p>
  <ul>
  <li><strong>WebSocket API のルート</strong>: <code>$connect</code>（接続時）、<code>$disconnect</code>（切断時、ベストエフォート）、<code>$default</code>（一致するルートがないとき）、カスタムルート（ルート選択式で振り分け）。</li>
  <li><strong>認可</strong>: IAM 認可か Lambda REQUEST オーソライザーを <code>$connect</code> に設定する。認可は接続時だけ行われる。</li>
  <li><strong>サーバーからのプッシュ</strong>: <code>@connections</code> API（<code>POST</code> で送信、<code>GET</code> で接続情報、<code>DELETE</code> で切断）。SigV4 で署名し、<code>execute-api:ManageConnections</code> が必要。切断済みの接続には <code>GoneException</code> が返る。</li>
  <li><strong>接続の管理</strong>: <code>$disconnect</code> は必ず呼ばれるとは限らないため、送信時の <code>GoneException</code> での削除や、DynamoDB の TTL による掃除を組み合わせる。</li>
  </ul>`,
    refs: [
      ["API Gateway: バックエンドサービスでの @connections コマンドの使用", "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html"],
      ["API Gateway: WebSocket API の Lambda REQUEST オーソライザー", "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-lambda-auth.html"],
      ["API Gateway: WebSocket API の IAM 認可", "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-control-access-iam.html"],
      ["API Gateway: WebSocket API のルート", "https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-routes.html"]
    ]
  },

  /* ---------- Q2: セキュリティ（SDK の認証情報プロバイダーチェーン） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ / 分野4 トラブルシューティングと最適化",
    tag: "原因の特定",
    type: "single", pick: 1,
    text: `
  <p>ある会社は、EC2 上で動いていた Python（boto3）のバッチ処理を、Amazon ECS on AWS Fargate のタスクに移行した。タスク定義にはタスクロール <code>report-task-role</code> を指定しており、このロールにはバケット <code>reports</code> への <code>s3:PutObject</code> を許可している。コードでは、認証情報を指定せずに <code>boto3.client("s3")</code> でクライアントを作成している。</p>
  <p>ところが、タスクを実行すると次のエラーが発生する。</p>
  <pre><code>botocore.exceptions.ClientError: An error occurred (AccessDenied) when calling
the PutObject operation: User: arn:aws:iam::111122223333:user/legacy-batch is not
authorized to perform: s3:PutObject on resource: "arn:aws:s3:::reports/2026-09-30.csv"</code></pre>
  <p>調べたところ、移行元から流用した Dockerfile に次の行が含まれていた。</p>
  <pre><code>ENV AWS_ACCESS_KEY_ID=AKIA................
ENV AWS_SECRET_ACCESS_KEY=................................</code></pre>
  <p>会社のセキュリティ方針では、アプリケーションで長期的なアクセスキーを使うことは禁止されている。この問題を解決するには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `Dockerfile から <code>AWS_ACCESS_KEY_ID</code> と <code>AWS_SECRET_ACCESS_KEY</code> を削除してイメージを再ビルドし、SDK がタスクロールの認証情報を使うようにする。イメージに埋め込まれていたアクセスキーは無効化して削除する。`,
        why: `SDK は、コードで認証情報が指定されていない場合、決まった順番で認証情報を探し、最初に見つかったものを使います。boto3 では<strong>環境変数</strong>がかなり早い段階で参照され、ECS のタスクロール（コンテナ認証情報プロバイダー）や EC2 のインスタンスメタデータは後のほうです。そのため、環境変数に残っていた IAM ユーザー <code>legacy-batch</code> のキーが優先され、エラーのプリンシパルもそのユーザーになっています。環境変数を削除すればタスクロールの一時的な認証情報が使われます。イメージに含まれていたキーは漏えいしたものとして扱い、無効化します。` },
      { correct: false, html: `タスク実行ロール（<code>executionRoleArn</code>）に、バケット <code>reports</code> への <code>s3:PutObject</code> を許可するポリシーを追加する。`,
        why: `タスク実行ロールは、ECS エージェントがコンテナイメージの取得やログの送信、シークレットの取得を行うためのロールで、アプリケーションのコードが使うものではありません。アプリケーションの権限はタスクロールで付与します。そもそも SDK が環境変数のキーを使っているので、どちらのロールに権限を追加しても結果は変わりません。` },
      { correct: false, html: `<code>report-task-role</code> の信頼ポリシーのプリンシパルを <code>ec2.amazonaws.com</code> に変更し、SDK がインスタンスメタデータからロールの認証情報を取得できるようにする。`,
        why: `ECS のタスクロールを引き受けるのは <code>ecs-tasks.amazonaws.com</code> です。信頼ポリシーを <code>ec2.amazonaws.com</code> に変えると、タスクがロールを引き受けられなくなります。Fargate のタスクはインスタンスメタデータではなく、コンテナ用の認証情報エンドポイント（<code>AWS_CONTAINER_CREDENTIALS_RELATIVE_URI</code>）からロールの認証情報を取得します。` },
      { correct: false, html: `IAM ユーザー <code>legacy-batch</code> に、バケット <code>reports</code> への <code>s3:PutObject</code> を許可するポリシーを追加する。`,
        why: `エラーは解消しますが、アプリケーションが長期的なアクセスキーを使い続けることになり、セキュリティ方針に反します。コンテナイメージにキーが埋め込まれたままなので、イメージにアクセスできる人がキーを取得できるリスクも残ります。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>認証情報プロバイダーチェーン</strong>: SDK はコードでの指定 → 環境変数 → 共有設定ファイルや SSO などのプロファイル → コンテナ認証情報（ECS タスクロール） → インスタンスメタデータ（EC2 のロール）の順に探す（詳細な順序は SDK ごとに異なる）。前のほうで見つかった認証情報が使われる。</li>
  <li><strong>エラーメッセージのプリンシパルを確認する</strong>: <code>AccessDenied</code> のメッセージには実際に使われたプリンシパルが表示される。想定と違う場合は、認証情報の取得元を疑う。<code>sts get-caller-identity</code> でも確認できる。</li>
  <li><strong>ECS の 2 つのロール</strong>: タスクロールはアプリケーション用、タスク実行ロールは ECS エージェント用（ECR からのイメージ取得、CloudWatch Logs、Secrets Manager / Parameter Store の値の注入）。</li>
  <li>アプリケーションには、ロール（EC2 のインスタンスプロファイル、ECS のタスクロール、Lambda の実行ロール）による一時的な認証情報を使う。</li>
  </ul>`,
    refs: [
      ["Boto3: 認証情報", "https://docs.aws.amazon.com/boto3/latest/guide/credentials.html"],
      ["AWS SDK とツール: 認証情報プロバイダーチェーン", "https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html"],
      ["Amazon ECS: タスク IAM ロール", "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html"],
      ["Amazon ECS: タスク実行 IAM ロール", "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html"]
    ]
  },

  /* ---------- Q3: デプロイ（API Gateway カスタムドメイン） ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "設定手順の選択",
    type: "multi", pick: 2,
    text: `
  <p>ある会社は、東京リージョン（<code>ap-northeast-1</code>）に 2 つの REST API を持っている。<code>OrdersV1</code> と、新しく開発した <code>OrdersV2</code> で、それぞれに <code>prod</code> ステージがある。DNS は Amazon Route 53 のパブリックホストゾーン <code>example.com</code> で管理している。</p>
  <p>世界中のクライアントからアクセスがあるため、次の URL で両方の API を公開したい。</p>
  <ul>
  <li><code>https://api.example.com/v1/...</code> → <code>OrdersV1</code> の <code>prod</code> ステージ</li>
  <li><code>https://api.example.com/v2/...</code> → <code>OrdersV2</code> の <code>prod</code> ステージ</li>
  </ul>
  <p>カスタムドメインはエッジ最適化で作成する。この要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `AWS Certificate Manager（ACM）で、<strong>us-east-1 リージョン</strong>に <code>api.example.com</code> のパブリック証明書をリクエストして DNS 検証を行い、その証明書を指定してエッジ最適化のカスタムドメイン名 <code>api.example.com</code> を作成する。`,
        why: `エッジ最適化のカスタムドメインは、API Gateway が管理する CloudFront ディストリビューションを使います。そのため、証明書は API のリージョンに関係なく、<strong>米国東部（バージニア北部）us-east-1</strong> の ACM でリクエストまたはインポートする必要があります。ACM が発行した証明書は自動で更新されます。` },
      { correct: true, html: `カスタムドメインに API マッピングを 2 つ作成する（ベースパス <code>v1</code> → <code>OrdersV1</code> の <code>prod</code>、ベースパス <code>v2</code> → <code>OrdersV2</code> の <code>prod</code>）。Route 53 で、<code>api.example.com</code> のエイリアス A レコードを作成し、カスタムドメインの CloudFront ディストリビューションのドメイン名（<code>xxxx.cloudfront.net</code>）をターゲットにする。`,
        why: `ベースパスマッピング（API マッピング）を使うと、1 つのカスタムドメインで複数の API やステージを公開できます。エッジ最適化のカスタムドメインを作成すると、ターゲットとなる CloudFront のドメイン名が発行されるので、DNS ではそこを指すレコードを作成します。Route 53 のエイリアスレコードを使うのが推奨されています。` },
      { correct: false, html: `API が東京リージョンにあるため、ACM で <strong>ap-northeast-1 リージョン</strong>に証明書をリクエストし、その証明書を指定してエッジ最適化のカスタムドメイン名を作成する。`,
        why: `ap-northeast-1 の証明書を使えるのは<strong>リージョン</strong>のカスタムドメインです。エッジ最適化のカスタムドメインでは us-east-1 の証明書しか選べません（一見できそうで不可能な構成）。` },
      { correct: false, html: `Route 53 で、<code>api.example.com</code> の CNAME レコードを作成し、<code>OrdersV1</code> の既定のエンドポイント <code>abc123.execute-api.ap-northeast-1.amazonaws.com</code> を指すようにする。<code>/v2</code> へのリクエストは、<code>OrdersV1</code> の統合で <code>OrdersV2</code> に転送する。`,
        why: `既定のエンドポイントは <code>*.execute-api.*.amazonaws.com</code> の証明書を提示するため、<code>api.example.com</code> で接続すると TLS の検証に失敗します。API Gateway にカスタムドメイン名として登録されていないホスト名は受け付けられません。さらに、API どうしを転送でつなぐ構成は余分な遅延と管理の手間を生みます。` },
      { correct: false, html: `2 つの API を 1 つの REST API に統合し、ステージ変数 <code>version</code> の値（<code>v1</code> / <code>v2</code>）で統合先の Lambda 関数を切り替える。カスタムドメインは <code>prod</code> ステージだけにマッピングする。`,
        why: `ステージ変数はステージごとに値が決まるため、同じステージの中でリクエストの URL パス（<code>/v1</code> と <code>/v2</code>）によって値を変えることはできません。また、既存の 2 つの API を作り直す必要があり、ベースパスマッピングを使うよりはるかに手間がかかります。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <table style="border-collapse:collapse;margin:8px 0;font-size:.95em">
  <tr><th style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">種類</th><th style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">証明書のリージョン</th><th style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">DNS のターゲット</th></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">エッジ最適化</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">us-east-1</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">CloudFront のドメイン名</td></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">リージョン</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">API と同じリージョン</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">リージョンのドメイン名（<code>d-xxxx.execute-api...</code>）</td></tr>
  </table>
  <ul>
  <li><strong>API マッピング</strong>: 1 つのカスタムドメインに、ベースパスごとに異なる API・ステージを割り当てられる。<code>v1/orders</code> のような複数階層のマッピングはリージョンのカスタムドメインだけで使える。</li>
  <li>カスタムドメインを使う場合、クライアントの URL にステージ名は含まれない（マッピングで指定したステージに振り分けられる）。</li>
  <li>エッジ最適化のカスタムドメインは、使えるようになるまで約 40 分かかる。</li>
  </ul>`,
    refs: [
      ["API Gateway: エッジ最適化カスタムドメイン名の設定", "https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-edge-optimized-custom-domain-name.html"],
      ["API Gateway: REST API のカスタムドメイン名", "https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-custom-domains.html"],
      ["Route 53: API Gateway API へのトラフィックのルーティング", "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-api-gateway.html"]
    ]
  },

  /* ---------- Q4: トラブルシューティング（CloudWatch アラーム） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化",
    tag: "設定の選択",
    type: "single", pick: 1,
    text: `
  <p>ある社内向けの Lambda 関数 <code>expense-approve</code> は、業務時間中だけ散発的に呼び出され、夜間や休日には 1 時間以上呼び出されないことも多い。開発者は、関数のエラーを検知して Amazon SNS トピックに通知する CloudWatch アラームを作成する。要件は次のとおりである。</p>
  <ul>
  <li>直近 5 分間のうち、<strong>エラーが 1 件以上発生した 1 分間が 3 つ以上</strong>あればアラーム状態にする。1 分間だけの一時的なエラーでは通知しない。</li>
  <li>呼び出しがない時間帯は正常とみなし、アラームは <code>OK</code> 状態のままにする（<code>INSUFFICIENT_DATA</code> にしない）。</li>
  </ul>
  <p>どのアラーム設定にすればよいですか。（いずれもメトリクスは <code>AWS/Lambda</code> 名前空間の <code>Errors</code>、ディメンションは <code>FunctionName=expense-approve</code>、アクションは SNS トピックへの通知とする）</p>`,
    options: [
      { correct: true, html: `<pre><code>Statistic: Sum
Period: 60
EvaluationPeriods: 5
DatapointsToAlarm: 3
ComparisonOperator: GreaterThanOrEqualToThreshold
Threshold: 1
TreatMissingData: notBreaching</code></pre>`,
        why: `期間 60 秒で 1 分ごとのエラー数（合計）をデータポイントにし、直近 5 個（評価期間）のうち 3 個（アラームを発生させるデータポイント数）が 1 以上ならアラーム状態になる「M out of N」の設定です。<code>Errors</code> は呼び出しがない時間帯にデータポイントが出力されないため、欠落データを <code>notBreaching</code>（正常）として扱えば、呼び出しがないときは <code>OK</code> になります。` },
      { correct: false, html: `<pre><code>Statistic: Sum
Period: 60
EvaluationPeriods: 5
DatapointsToAlarm: 3
ComparisonOperator: GreaterThanOrEqualToThreshold
Threshold: 1
TreatMissingData: missing</code></pre>`,
        why: `<code>missing</code> は既定の扱いです。評価範囲のデータポイントがすべて欠落していると、アラームは <code>INSUFFICIENT_DATA</code> に遷移します。夜間や休日に呼び出しがないと <code>INSUFFICIENT_DATA</code> になるため、「呼び出しがない時間帯は <code>OK</code> のまま」という要件を満たせません。` },
      { correct: false, html: `<pre><code>Statistic: Sum
Period: 60
EvaluationPeriods: 5
DatapointsToAlarm: 3
ComparisonOperator: GreaterThanOrEqualToThreshold
Threshold: 1
TreatMissingData: breaching</code></pre>`,
        why: `欠落データを<strong>違反</strong>として扱うため、呼び出しのない時間帯が数分続くだけでアラーム状態になり、夜間や休日に誤った通知が繰り返し送られます。<code>breaching</code> は、データが途絶えること自体が異常を意味するメトリクス（ハートビートなど）に使います。` },
      { correct: false, html: `<pre><code>Statistic: Sum
Period: 300
EvaluationPeriods: 1
DatapointsToAlarm: 1
ComparisonOperator: GreaterThanOrEqualToThreshold
Threshold: 3
TreatMissingData: notBreaching</code></pre>`,
        why: `5 分間のエラーの<strong>合計</strong>が 3 件以上かどうかを評価する設定です。1 分間に 3 件のエラーがまとめて発生しただけでもアラーム状態になるので、「エラーが発生した 1 分間が 3 つ以上」という要件とは異なり、一時的なエラーでも通知されてしまいます。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>評価の設定</strong>: 期間（Period）は 1 つのデータポイントを作る時間の長さ、評価期間（Evaluation Periods, N）は評価に使う直近のデータポイント数、アラームを発生させるデータポイント数（Datapoints to Alarm, M）は N のうち違反しているとアラーム状態になる数。M と N を変えると「M out of N」アラームになり、一時的なスパイクによる誤報を減らせる。</li>
  <li><strong>欠落データの扱い</strong>: <code>notBreaching</code>（正常とみなす）、<code>breaching</code>（違反とみなす）、<code>ignore</code>（現在の状態を維持）、<code>missing</code>（既定。すべて欠落すると <code>INSUFFICIENT_DATA</code>）。エラーのときだけ出力されるメトリクスには <code>notBreaching</code> が適している。</li>
  <li><strong>統計</strong>: 件数を表すメトリクス（<code>Errors</code>、<code>Throttles</code>）は <code>Sum</code>、所要時間は <code>Average</code> や <code>p99</code> などのパーセンタイルを使う。</li>
  <li>エラー率で判断したい場合は、メトリクス計算（<code>Errors / Invocations * 100</code>）を使ったアラームにする。複数のアラームをまとめて通知したい場合は複合アラームを使う。</li>
  </ul>`,
    refs: [
      ["CloudWatch: アラームの評価", "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarm-evaluation.html"],
      ["CloudWatch: アラームでの欠落データの扱い", "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html"],
      ["Lambda: 関数のメトリクスの種類", "https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html"]
    ]
  },

  /* ---------- Q5: 開発（AWS SAM によるテスト） ---------- */
  {
    id: "q5",
    domain: "分野1 開発 / 分野3 デプロイ",
    tag: "テストの実施",
    type: "multi", pick: 2,
    text: `
  <p>開発者は、S3 バケットへのアップロードをトリガーに動く Lambda 関数 <code>ResizeFunction</code> を AWS SAM で開発している。関数は処理結果を DynamoDB テーブルに書き込む。開発用のスタック <code>resize-dev</code> は、すでに AWS にデプロイされている。</p>
  <p>開発者は次の 2 つのテストを行いたい。</p>
  <ul>
  <li>コードを変更するたびに、S3 の <code>ObjectCreated</code> イベントを模したテストイベントを使って、関数を開発マシン上で実行する。</li>
  <li>デプロイ済みの <code>resize-dev</code> スタックの関数を、同じテストイベントでコマンドラインから呼び出し、クラウド上の動作を確認する。</li>
  </ul>
  <p>これらのテストを行う方法として正しいものはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `<code>sam local generate-event s3 put --bucket uploads-dev --key images/sample.jpg &gt; events/s3-put.json</code> でテストイベントを作成し、<code>sam build</code> の後に <code>sam local invoke ResizeFunction --event events/s3-put.json</code> を実行する。`,
        why: `<code>sam local generate-event</code> は、S3、SQS、API Gateway などのサービスが Lambda に渡すイベントのサンプル JSON を生成します。<code>sam local invoke</code> は、Lambda の実行環境を模したコンテナ（Docker などのコンテナランタイムが必要）で関数を 1 回実行し、ログと戻り値を表示します。` },
      { correct: true, html: `<code>sam remote invoke ResizeFunction --stack-name resize-dev --event-file events/s3-put.json</code> を実行する。`,
        why: `<code>sam remote invoke</code> は、デプロイ済みのリソースを AWS 上で呼び出すコマンドです。<code>--stack-name</code> とテンプレートの論理 ID で関数を指定でき、<code>--event-file</code> でイベントを渡せます。Lambda のほか、SQS キュー、Kinesis Data Streams、Step Functions のステートマシンにも使えます。` },
      { correct: false, html: `<code>sam local invoke</code> は、Docker などのコンテナランタイムを使わずに、開発マシンにインストールされた Python で関数を直接実行する。そのため、開発マシンの Python のバージョンを Lambda のランタイムと合わせるだけで準備が整う。`,
        why: `<code>sam local invoke</code> は、Lambda のランタイムのコンテナイメージを使って<strong>コンテナの中で</strong>関数を実行します。Docker などのコンテナランタイムが必要で、開発マシンの Python で直接実行するわけではありません。` },
      { correct: false, html: `<code>sam local invoke</code> で実行すると、関数から呼び出す DynamoDB や S3 も SAM CLI がローカルでエミュレートするため、AWS の認証情報がなくてもテストできる。`,
        why: `SAM CLI がローカルで実行するのは Lambda 関数（と API Gateway のエンドポイントなど）だけです。関数のコードから呼び出す DynamoDB などは、<strong>実際の AWS サービス</strong>に接続されます（<code>--env-vars</code> でデプロイ済みのテーブル名を渡すなど）。そのため、開発マシンの AWS 認証情報と、そのプリンシパルの権限が必要です。` },
      { correct: false, html: `本番スタックで問題が見つかったときは、<code>sam sync --watch --stack-name resize-prod</code> を実行し、CloudFormation のデプロイを待たずにコードの変更を本番の関数へすぐに反映する。`,
        why: `<code>sam sync</code> は、コードの変更を Lambda などのサービス API で直接反映するため、CloudFormation スタックとの間にドリフトが生じます。AWS のドキュメントでも、<strong>開発用のスタックでだけ使う</strong>よう明記されています。本番環境には <code>sam deploy</code> やパイプラインでデプロイします。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>ローカルでのテスト</strong>: <code>sam local invoke</code>（関数を 1 回実行）、<code>sam local start-api</code>（API Gateway のエンドポイントをローカルで起動）、<code>sam local start-lambda</code>（Lambda の呼び出しエンドポイントをエミュレート）、<code>sam local generate-event</code>（テストイベントの生成）。</li>
  <li><strong>クラウドでのテスト</strong>: <code>sam remote invoke</code>（デプロイ済みリソースの呼び出し）、<code>sam remote test-event</code>（共有可能なテストイベントの管理）、<code>sam sync --watch</code>（開発スタックへの高速な反映）、<code>sam logs</code>（ログの取得）。</li>
  <li>ローカルのテストでは、IAM の権限やリソース間の連携までは検証できない。AWS はできるだけクラウドでテストすることを推奨している。</li>
  <li>外部依存をテストで置き換えたい場合は、ユニットテストでモック（Python の <code>unittest.mock</code>、<code>moto</code> など）を使う。</li>
  </ul>`,
    refs: [
      ["AWS SAM: sam local invoke によるテスト", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-local-invoke.html"],
      ["AWS SAM: sam local generate-event によるテスト", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-local-generate-event.html"],
      ["AWS SAM: sam remote invoke によるクラウドでのテスト", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-remote-invoke.html"],
      ["AWS SAM: sam sync の概要", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-sync.html"]
    ]
  }
  ]
});
