/* DVA-C02 模擬試験 Day 002 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 * ※ テンプレートリテラル内の IAM ポリシー変数・ステージ変数は \${...} でエスケープしている
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "002",
  date: "2026-09-24",
  title: "Cognito 連携・ステージ変数・GSI 設計・Lambda チューニング・エンベロープ暗号化",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・2 横断） ---------- */
  {
    id: "q1",
    domain: "分野1 開発 / 分野2 セキュリティ",
    tag: "重量級シナリオ・ポリシー比較",
    type: "multi", pick: 3,
    text: `
  <p>ある開発チームは、写真付きメモを保存するモバイルアプリを開発している。ユーザーは Amazon Cognito ユーザープールでサインインする。アーキテクチャは次のとおりである。</p>
  <ul>
  <li>写真はアプリから Amazon S3 バケット <code>photo-notes</code> に AWS SDK で直接アップロードする。</li>
  <li>メモはアプリから Amazon DynamoDB テーブル <code>Notes</code> に AWS SDK で直接読み書きする。パーティションキー <code>userId</code> には、Cognito ID プールが発行する ID（identity ID）を格納する設計である。</li>
  <li>共有機能などのサーバー処理は、Amazon API Gateway（REST API）→ AWS Lambda で提供する。</li>
  </ul>
  <p>セキュリティ要件は次のとおりである。</p>
  <ul>
  <li>アプリに長期的な AWS 認証情報（アクセスキー）を埋め込まない。</li>
  <li>各ユーザーは S3 では自分のプレフィックス配下のオブジェクトだけ、DynamoDB では自分の <code>userId</code> の項目だけにアクセスできる。</li>
  <li>REST API はサインイン済みユーザーからのリクエストだけを受け付ける。トークン検証のためのカスタムコードは書かない。</li>
  </ul>
  <p>これらの要件をすべて満たすために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `Cognito ID プールを作成し、ユーザープールを認証プロバイダーとして設定する。アプリはサインイン後に取得した ID トークンを ID プールに渡して、認証済みロールの一時的な AWS 認証情報を取得し、その認証情報で S3 と DynamoDB を呼び出す。`,
        why: `ユーザープールは「ユーザーの認証と JWT の発行」、ID プールは「トークンを AWS の一時認証情報に交換」する役割です。ID プールは内部で AWS STS の <code>AssumeRoleWithWebIdentity</code> 相当の処理を行い、認証済みロールの一時認証情報を返すため、アプリに長期的なアクセスキーを埋め込む必要がありません。` },
      { correct: true, html: `ID プールの認証済みロールに次のポリシーをアタッチする。
  <pre><code>{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["s3:PutObject", "s3:GetObject"],
        "Resource": "arn:aws:s3:::photo-notes/private/\${cognito-identity.amazonaws.com:sub}/*"
      },
      {
        "Effect": "Allow",
        "Action": ["dynamodb:GetItem", "dynamodb:PutItem",
                   "dynamodb:UpdateItem", "dynamodb:DeleteItem",
                   "dynamodb:Query"],
        "Resource": "arn:aws:dynamodb:ap-northeast-1:111122223333:table/Notes",
        "Condition": {
          "ForAllValues:StringEquals": {
            "dynamodb:LeadingKeys": ["\${cognito-identity.amazonaws.com:sub}"]
          }
        }
      }
    ]
  }</code></pre>`,
        why: `<code>\${cognito-identity.amazonaws.com:sub}</code> は ID プールの identity ID に置き換わるポリシー変数です。S3 では Resource のプレフィックスに埋め込むことで自分のフォルダだけを許可し、DynamoDB では <code>dynamodb:LeadingKeys</code> 条件キーでパーティションキーの値を自分の identity ID に限定します（項目レベルのきめ細かなアクセス制御）。1 つのロールで全ユーザーに「自分のデータだけ」を許可できる定石パターンです。` },
      { correct: true, html: `REST API に <code>COGNITO_USER_POOLS</code> タイプのオーソライザーを作成してユーザープールを指定し、対象メソッドに設定する。アプリはユーザープールのトークンを <code>Authorization</code> ヘッダーに付けて API を呼び出す。`,
        why: `Cognito ユーザープールオーソライザーは API Gateway がトークンの署名・有効期限・発行者を検証するため、Lambda オーソライザーのようなカスタムコードは不要です。メソッドに OAuth スコープを設定しない場合は ID トークン、スコープを設定した場合はアクセストークンを送ります。` },
      { correct: false, html: `アプリのユーザーごとに IAM ユーザーを作成して Cognito ユーザープールに追加し、サインイン時に IAM ユーザーのアクセスキーをアプリに返す。IAM ユーザーには自分のデータだけにアクセスできるポリシーをアタッチする。`,
        why: `Cognito ユーザープールのユーザーは IAM とは別のディレクトリであり、IAM ユーザーをユーザープールに「追加」する仕組みはありません（一見できそうで不可能な構成）。また、アクセスキーは長期的な認証情報なので、仮に配布できたとしても要件に反します。IAM ユーザーには 1 アカウントあたりのクォータもあり、エンドユーザー管理には使いません。` },
      { correct: false, html: `ID プールは使用せず、ユーザープールから取得したアクセストークンをそのまま AWS SDK の認証情報として設定し、S3 と DynamoDB を呼び出す。バケットポリシーとテーブルのリソースベースポリシーでユーザープールの ARN を許可する。`,
        why: `S3 や DynamoDB の API は SigV4 署名（AWS の認証情報）でリクエストを認証します。Cognito ユーザープールの JWT は SigV4 の認証情報ではないため、AWS サービスを直接呼び出すことはできません。JWT を AWS 認証情報に交換するのが ID プールの役割です。また、リソースベースポリシーの <code>Principal</code> にユーザープールを指定することもできません。` },
      { correct: false, html: `認証済みロールの DynamoDB ステートメントの条件を、次のように <code>dynamodb:Attributes</code> で指定する。
  <pre><code>"Condition": {
    "ForAllValues:StringEquals": {
      "dynamodb:Attributes": ["\${cognito-identity.amazonaws.com:sub}"]
    }
  }</code></pre>`,
        why: `<code>dynamodb:Attributes</code> は「リクエストでアクセスできる属性名」を制限する条件キーで、列（属性）レベルの制御に使います。どのパーティションキー値の項目にアクセスできるか（行レベル）を制限するのは <code>dynamodb:LeadingKeys</code> です。この条件では属性名に identity ID を要求することになり、意図した「自分の項目だけ」の制御になりません。` },
      { correct: false, html: `REST API のリソースポリシーで、<code>Principal</code> に Cognito ユーザープールの ARN を指定して <code>execute-api:Invoke</code> を許可し、サインイン済みユーザーだけが API を呼び出せるようにする。`,
        why: `API Gateway のリソースポリシーの <code>Principal</code> に指定できるのは AWS アカウント・IAM ユーザー/ロールなどの AWS プリンシパルで、Cognito ユーザープールは指定できません。リソースポリシーはアカウント・IP・VPC エンドポイントなどでの制御に使い、ユーザープールのトークン検証にはオーソライザーを使います。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <p>この問題は「フェデレーテッドアクセス（分野2）」「アプリケーションレベルのきめ細かな認可（分野2）」「AWS SDK による AWS サービス呼び出し（分野1）」を横断しています。</p>
  <ul>
  <li><strong>ユーザープール vs ID プール</strong>: ユーザープールは認証（サインアップ/サインイン、JWT 発行）。ID プールはユーザープールや外部 IdP のトークンを <strong>AWS の一時認証情報</strong>に交換する。AWS サービスを直接呼ぶなら ID プールが必要。</li>
  <li><strong>ポリシー変数によるマルチテナント制御</strong>: <code>\${cognito-identity.amazonaws.com:sub}</code>（identity ID）を S3 のプレフィックスや <code>dynamodb:LeadingKeys</code> に使うと、1 つのロールでユーザーごとにデータを分離できる。注意点は、ポリシー変数が指すのは<strong>ユーザープールの sub ではなく identity ID</strong> であること。</li>
  <li><strong>DynamoDB の条件キー</strong>: 行レベル = <code>dynamodb:LeadingKeys</code>、列レベル = <code>dynamodb:Attributes</code>（<code>dynamodb:Select</code> と組み合わせて使う）。</li>
  <li><strong>API Gateway の認可</strong>: Cognito オーソライザー（コード不要）、Lambda オーソライザー（任意のトークン・カスタムロジック）、IAM 認可（SigV4）、リソースポリシー（アカウント/IP/VPC による制御）を使い分ける。</li>
  </ul>`,
    refs: [
      ["Cognito: ID プールの IAM ロールとポリシー変数", "https://docs.aws.amazon.com/cognito/latest/developerguide/iam-roles.html"],
      ["API Gateway: Cognito ユーザープールをオーソライザーとして使用", "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html"],
      ["DynamoDB: IAM ポリシー条件によるきめ細かなアクセスコントロール", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/specifying-conditions.html"],
      ["API Gateway: リソースポリシー", "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies.html"]
    ]
  },

  /* ---------- Q2: デプロイ（ステージ変数 × Lambda エイリアス） ---------- */
  {
    id: "q2",
    domain: "分野3 デプロイ",
    tag: "最小限の構成作業量",
    type: "single", pick: 1,
    text: `
  <p>ある会社は、Amazon API Gateway の REST API から Lambda プロキシ統合で Lambda 関数 <code>orders</code> を呼び出している。関数には発行済みバージョンを指す <code>dev</code> エイリアスと <code>prod</code> エイリアスがある。チームは次の要件を満たしたい。</p>
  <ul>
  <li>1 つの REST API に <code>dev</code> ステージと <code>prod</code> ステージを作成し、各ステージがそれぞれ同名の Lambda エイリアスを呼び出す。</li>
  <li>エイリアスが指すバージョンを切り替えても、API の定義を変更・再デプロイする必要がない。</li>
  </ul>
  <p>最小限の構成作業量でこれらの要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `各ステージにステージ変数 <code>lambdaAlias</code>（値は <code>dev</code> / <code>prod</code>）を定義し、統合の Lambda 関数に <code>orders:\${stageVariables.lambdaAlias}</code> を指定する。さらに <code>aws lambda add-permission</code> で、<code>dev</code> と <code>prod</code> の各エイリアスに API Gateway からの <code>lambda:InvokeFunction</code> を許可するリソースベースポリシーを追加する。`,
        why: `ステージ変数を統合先の関数 ARN に埋め込むと、1 つの API 定義のままステージごとに呼び出すエイリアスを切り替えられます。API Gateway は実行時に変数を解決するため、エイリアスの指すバージョンを更新しても API の再デプロイは不要です。ただし、関数名がステージ変数で決まるため、API Gateway は権限を自動追加できません。各エイリアス（修飾 ARN）ごとに <code>add-permission</code> で呼び出し権限を付与する必要があります。` },
      { correct: false, html: `各ステージにステージ変数 <code>lambdaAlias</code> を定義し、統合の Lambda 関数に <code>orders:\${stageVariables.lambdaAlias}</code> を指定する。呼び出し権限は、統合を保存した時点で API Gateway が各エイリアスに自動的に追加するため、追加の設定は不要である。`,
        why: `ステージ変数を使った統合では、保存時点では実際に呼び出されるエイリアスが確定しないため、API Gateway は Lambda のリソースベースポリシーを自動追加しません（コンソールは実行すべき <code>add-permission</code> コマンドを表示します）。権限がないと呼び出し時に 500 エラー（<code>Invalid permissions on Lambda function</code>）になります。` },
      { correct: false, html: `統合の Lambda 関数には非修飾の <code>orders</code> を指定する。Lambda 関数の環境変数 <code>ALIAS</code> に <code>\${stageVariables.stage}</code> を設定し、関数コード内で環境変数を見て処理を切り替える。`,
        why: `Lambda の環境変数はバージョンに固定された静的な値で、API Gateway のステージ変数を参照する構文はありません。また非修飾 ARN は <code>$LATEST</code> を呼び出すため、エイリアスのバージョン管理が使われません。なお、プロキシ統合ではステージ変数がイベントの <code>stageVariables</code> に渡されますが、呼び出す関数バージョン自体は切り替わりません。` },
      { correct: false, html: `<code>dev</code> 用と <code>prod</code> 用に REST API を 2 つ作成し、それぞれの統合に <code>orders:dev</code> と <code>orders:prod</code> のエイリアス ARN を直接指定してデプロイする。`,
        why: `要件自体は満たせますが、同じ API 定義を 2 つ保守することになり、変更のたびに両方を更新・デプロイする必要があります。「1 つの REST API に 2 ステージ」という要件にも反し、最小構成ではありません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>ステージ変数</strong>はステージに紐づくキーと値のペア。統合 URI（Lambda 関数名/エイリアス、HTTP エンドポイント）やマッピングテンプレートで <code>\${stageVariables.name}</code> として参照できる。</li>
  <li>ステージ変数で Lambda を指定した場合、<strong>各エイリアスへの呼び出し権限を手動で追加</strong>する（<code>--function-name "arn:aws:lambda:...:function:orders:prod"</code>、<code>--principal apigateway.amazonaws.com</code>、<code>--source-arn</code> に API の実行 ARN）。</li>
  <li>Lambda エイリアスが発行済みバージョンを指すことで、「承認済みバージョンを使う環境」を作れる。本番の切り替えはエイリアスの更新だけで済む。</li>
  <li>プロキシ統合では <code>event.stageVariables</code> で関数コードにも値が渡るため、ステージ別のテーブル名などを渡す用途にも使える。</li>
  </ul>`,
    refs: [
      ["API Gateway: ステージ変数の使用（Lambda エイリアス）", "https://docs.aws.amazon.com/apigateway/latest/developerguide/amazon-api-gateway-using-stage-variables.html"],
      ["API Gateway: ステージ変数のリファレンス", "https://docs.aws.amazon.com/apigateway/latest/developerguide/aws-api-gateway-stage-variables-reference.html"],
      ["Lambda: エイリアス", "https://docs.aws.amazon.com/lambda/latest/dg/configuration-aliases.html"],
      ["Lambda: 環境変数", "https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html"]
    ]
  },

  /* ---------- Q3: 開発（DynamoDB のキー・インデックス設計） ---------- */
  {
    id: "q3",
    domain: "分野1 開発",
    tag: "コード実装",
    type: "single", pick: 1,
    text: `
  <p>ある EC サイトの DynamoDB テーブル <code>Orders</code> は、パーティションキーが <code>orderId</code>（ソートキーなし）で、数千万件の項目がある。各項目には <code>customerId</code> と <code>orderDate</code>（ISO 8601 形式の文字列）属性がある。</p>
  <p>新しく「注文履歴」画面を作成し、指定した顧客の注文を<strong>新しい順に 20 件</strong>表示する。注文の反映が数秒遅れることは許容される。読み込みキャパシティの消費を最小限に抑える必要がある。</p>
  <p>この要件を満たす実装はどれですか。（Python / boto3 の resource API を使用）</p>`,
    options: [
      { correct: true, html: `パーティションキー <code>customerId</code>、ソートキー <code>orderDate</code> のグローバルセカンダリインデックス（GSI）を追加し、次のように取得する。
  <pre><code>resp = table.query(
      IndexName="customerId-orderDate-index",
      KeyConditionExpression=Key("customerId").eq(customer_id),
      ScanIndexForward=False,   # ソートキーの降順
      Limit=20
  )
  orders = resp["Items"]</code></pre>`,
        why: `GSI は既存テーブルに後から追加でき、別のパーティションキー・ソートキーでクエリできます。<code>Query</code> は指定した顧客のパーティションだけを読むため、キャパシティ消費が最小です。<code>ScanIndexForward=False</code> でソートキー（<code>orderDate</code>）の降順になり、<code>Limit=20</code> で最新 20 件を取得できます。GSI への反映は結果整合性ですが、数秒の遅れは許容されています。` },
      { correct: false, html: `上記と同じ GSI を追加し、最新の注文を確実に表示するため強い整合性で取得する。
  <pre><code>resp = table.query(
      IndexName="customerId-orderDate-index",
      KeyConditionExpression=Key("customerId").eq(customer_id),
      ScanIndexForward=False,
      Limit=20,
      ConsistentRead=True
  )</code></pre>`,
        why: `GSI は結果整合性の読み込みのみをサポートします。GSI に対して <code>ConsistentRead=True</code> を指定すると <code>ValidationException</code> になります。強い整合性の読み込みが可能なのはベーステーブルとローカルセカンダリインデックス（LSI）です。` },
      { correct: false, html: `インデックスは追加せず、次のようにスキャンで取得する。
  <pre><code>resp = table.scan(
      FilterExpression=Attr("customerId").eq(customer_id),
      Limit=20
  )
  orders = sorted(resp["Items"],
                  key=lambda o: o["orderDate"], reverse=True)</code></pre>`,
        why: `<code>Limit</code> はフィルター適用<strong>前</strong>に評価される項目数です。このコードはテーブル先頭の任意の 20 件を読んでからフィルターするため、該当顧客の注文が 0 件になることもあり、全件を得るにはテーブル全体をページングしてスキャンする必要があります。フィルターで除外された項目も読み込みキャパシティを消費するため、数千万件のテーブルでは非常に非効率です。` },
      { correct: false, html: `<code>UpdateTable</code> でパーティションキー <code>customerId</code>、ソートキー <code>orderDate</code> のローカルセカンダリインデックス（LSI）を追加し、<code>IndexName</code> に LSI を指定して <code>Query</code> する。`,
        why: `LSI はテーブル作成時にしか定義できず、既存テーブルに <code>UpdateTable</code> で追加することはできません。さらに LSI のパーティションキーはベーステーブルと同じ（ここでは <code>orderId</code>）である必要があり、ソートキーだけを変えられるものです。<code>customerId</code> をパーティションキーにする LSI は作れません（一見できそうで不可能な構成）。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>GSI</strong>: 任意のパーティションキー/ソートキー、後から追加・削除可能、<strong>結果整合性のみ</strong>、プロビジョンドモードでは独自のキャパシティを持つ。</li>
  <li><strong>LSI</strong>: パーティションキーはテーブルと同じでソートキーだけ別、<strong>テーブル作成時のみ</strong>定義可能、強い整合性の読み込みが可能、パーティションキー値ごとに 10 GB の制限。</li>
  <li><strong>Query vs Scan</strong>: Query はキー条件でパーティションを絞り込む。Scan はテーブル全体を読む。<code>FilterExpression</code> は読み込み後に適用されるので消費キャパシティは減らない。</li>
  <li>並び替えはソートキーで行い、<code>ScanIndexForward=False</code> で降順。1 MB を超える結果は <code>LastEvaluatedKey</code> でページングする。</li>
  </ul>`,
    refs: [
      ["DynamoDB: グローバルセカンダリインデックス", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html"],
      ["DynamoDB: ローカルセカンダリインデックス", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/LSI.html"],
      ["DynamoDB: Query オペレーション", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html"],
      ["DynamoDB: Scan オペレーション", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html"]
    ]
  },

  /* ---------- Q4: トラブルシューティングと最適化（Lambda のメモリと CPU） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化",
    tag: "ログ解釈・性能チューニング",
    type: "multi", pick: 2,
    text: `
  <p>画像のサムネイルを生成する Lambda 関数（Python、画像処理ライブラリを使用）の処理時間が長いという報告があった。CloudWatch Logs には、ほとんどの呼び出しで次のような <code>REPORT</code> 行が出力されている。</p>
  <pre><code>REPORT RequestId: 3f1c... Duration: 7984.21 ms Billed Duration: 7985 ms
Memory Size: 512 MB Max Memory Used: 183 MB</code></pre>
  <p><code>Init Duration</code> が記録されている呼び出し（コールドスタート）は全体の 1% 未満である。プロファイリングの結果、処理時間の大半は画像の縮小処理（CPU 処理）であり、外部 API の待ち時間はほとんどないことがわかった。</p>
  <p>開発者は処理時間を短縮し、コストとのバランスが取れた設定を根拠をもって決めたい。実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `関数のメモリ設定を 512 MB から引き上げる（例: 1,769 MB）。`,
        why: `Lambda は割り当てメモリに比例して CPU 能力を割り当てます（1,769 MB で 1 vCPU 相当）。CPU 処理がボトルネックなので、使用メモリが少なくてもメモリを増やすことで処理時間が短縮されます。処理時間が短くなれば、GB 秒単価が上がっても総コストが同等以下になることも多くあります。` },
      { correct: true, html: `AWS Lambda Power Tuning（AWS Step Functions のステートマシン）を使い、複数のメモリ設定で関数を実際に呼び出して、処理時間とコストを比較する。`,
        why: `Lambda Power Tuning は AWS が公開しているオープンソースツールで、指定した複数のメモリ設定で関数を実行し、処理時間とコストの結果を可視化します。「速度優先」「コスト優先」「バランス」の観点で最適なメモリ設定を測定に基づいて判断できます。AWS Compute Optimizer の Lambda 向けメモリ推奨も同様の目的で使えます。` },
      { correct: false, html: `最大使用メモリ（183 MB）が割り当て（512 MB）を大きく下回っているため、メモリを 256 MB に下げてコストを削減する。`,
        why: `メモリを下げると CPU 割り当ても比例して減るため、CPU バウンドな処理はさらに遅くなります。処理時間が延びると課金時間も増え、コストが下がるとは限りません。「使用メモリが少ない = メモリを下げてよい」とは限らない典型例です。` },
      { correct: false, html: `プロビジョニングされた同時実行を設定し、実行環境を事前に初期化しておく。`,
        why: `プロビジョニングされた同時実行が短縮するのは初期化（コールドスタート）の時間です。本問ではコールドスタートは 1% 未満で、遅延の原因はハンドラー内の CPU 処理なので効果がありません。追加のコストもかかります。` },
      { correct: false, html: `関数の構成で vCPU 数を 2 に設定し、メモリ設定は 512 MB のまま CPU 能力だけを増やす。`,
        why: `Lambda には vCPU 数を直接指定する設定はありません。CPU 能力はメモリ設定（128 MB〜10,240 MB）に比例して自動的に割り当てられます（一見できそうで不可能な構成）。` },
      { correct: false, html: `関数のタイムアウトを 15 分（900 秒）に延長する。`,
        why: `タイムアウトは「処理を打ち切るまでの上限」であり、処理自体を速くするものではありません。タイムアウトエラーは防げても、処理時間短縮という目的は達成できません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>メモリと CPU は連動</strong>: Lambda の設定値はメモリのみ。CPU・ネットワーク帯域はメモリに比例して割り当てられ、1,769 MB で 1 vCPU 相当、最大 10,240 MB で 6 vCPU。1,769 MB を超えて効果を得るには、コードがマルチスレッド/マルチプロセスで複数コアを使う必要がある。</li>
  <li><strong>REPORT 行の読み方</strong>: <code>Duration</code>（実行時間）、<code>Billed Duration</code>（課金時間）、<code>Memory Size</code>（割り当て）、<code>Max Memory Used</code>（最大使用量）、<code>Init Duration</code>（コールドスタート時のみ）。CloudWatch Logs Insights では <code>filter @type = "REPORT"</code> と <code>@duration</code> / <code>@maxMemoryUsed</code> / <code>@initDuration</code> で集計できる。</li>
  <li><strong>対策の使い分け</strong>: 初期化が遅い → プロビジョニングされた同時実行や SnapStart（対応ランタイム）。ハンドラーが CPU バウンド → メモリ増。I/O 待ち → 並列化や接続の再利用。</li>
  <li>最適値は計測で決める（Lambda Power Tuning、Compute Optimizer）。</li>
  </ul>`,
    refs: [
      ["Lambda: メモリの設定", "https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html"],
      ["Lambda: プロビジョニングされた同時実行", "https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html"],
      ["Lambda Operator Guide: 関数のプロファイリング（Power Tuning）", "https://docs.aws.amazon.com/lambda/latest/operatorguide/profile-functions.html"],
      ["CloudWatch Logs Insights: Lambda ログのクエリ例", "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-examples.html"]
    ]
  },

  /* ---------- Q5: セキュリティ（エンベロープ暗号化） ---------- */
  {
    id: "q5",
    domain: "分野2 セキュリティ",
    tag: "疑似コード",
    type: "single", pick: 1,
    text: `
  <p>ある医療系アプリケーションは、患者の検査結果 PDF（1 件あたり約 5 MB、PHI を含む）を Amazon S3 に保存する前に、アプリケーション側で暗号化する必要がある。要件は次のとおりである。</p>
  <ul>
  <li>暗号化には AWS KMS のカスタマー管理キー（対称キー）を使用する。</li>
  <li>復号できるのは KMS キーの使用を許可されたプリンシパルだけであり、復号のたびに AWS CloudTrail に記録が残る。</li>
  <li>平文のキーを永続化しない。</li>
  </ul>
  <p>これらの要件を満たす実装はどれですか。（Python / boto3、<code>AESGCM</code> は <code>cryptography</code> ライブラリ）</p>`,
    options: [
      { correct: true, html: `<pre><code>def encrypt_file(data: bytes) -&gt; dict:
    dk = kms.generate_data_key(KeyId=KEY_ARN, KeySpec="AES_256")
    nonce = os.urandom(12)
    ciphertext = AESGCM(dk["Plaintext"]).encrypt(nonce, data, None)
    # 保存するのは暗号化済みデータキーのみ。平文データキーは使用後に破棄
    return {"encryptedKey": dk["CiphertextBlob"],
            "nonce": nonce, "ciphertext": ciphertext}

def decrypt_file(obj: dict) -&gt; bytes:
    key = kms.decrypt(KeyId=KEY_ARN,
                      CiphertextBlob=obj["encryptedKey"])["Plaintext"]
    return AESGCM(key).decrypt(obj["nonce"], obj["ciphertext"], None)</code></pre>`,
        why: `エンベロープ暗号化の正しい実装です。<code>GenerateDataKey</code> は平文のデータキーと、KMS キーで暗号化されたデータキー（<code>CiphertextBlob</code>）を返します。データはローカルで平文データキーを使って暗号化し、暗号化済みデータキーだけをデータと一緒に保存します。復号時は KMS の <code>Decrypt</code> でデータキーを復号するため、KMS キーの権限による制御と CloudTrail への記録が行われます。` },
      { correct: false, html: `<pre><code>def encrypt_file(data: bytes) -&gt; dict:
    resp = kms.encrypt(KeyId=KEY_ARN, Plaintext=data)
    return {"ciphertext": resp["CiphertextBlob"]}

def decrypt_file(obj: dict) -&gt; bytes:
    return kms.decrypt(KeyId=KEY_ARN,
                       CiphertextBlob=obj["ciphertext"])["Plaintext"]</code></pre>`,
        why: `KMS の <code>Encrypt</code> API で直接暗号化できる平文は最大 4,096 バイトです。約 5 MB の PDF を渡すと <code>ValidationException</code> になります。KMS キーで直接暗号化するのはパスワードなどの小さなデータに限られ、大きなデータはエンベロープ暗号化を使います。` },
      { correct: false, html: `<pre><code>def encrypt_file(data: bytes) -&gt; dict:
    dk = kms.generate_data_key_without_plaintext(KeyId=KEY_ARN,
                                                 KeySpec="AES_256")
    nonce = os.urandom(12)
    ciphertext = AESGCM(dk["CiphertextBlob"]).encrypt(nonce, data, None)
    return {"encryptedKey": dk["CiphertextBlob"],
            "nonce": nonce, "ciphertext": ciphertext}</code></pre>`,
        why: `<code>GenerateDataKeyWithoutPlaintext</code> は暗号化済みデータキーしか返さないため、その場ではデータを暗号化できません（後で <code>Decrypt</code> してから使う用途の API です）。<code>CiphertextBlob</code> は KMS のメタデータを含む暗号文であり AES キーではないので、キー長不正でエラーになります。仮に動いたとしても、保存した値そのものが鍵になり、KMS による保護が意味を失います。` },
      { correct: false, html: `<pre><code>def encrypt_file(data: bytes) -&gt; dict:
    dk = kms.generate_data_key(KeyId=KEY_ARN, KeySpec="AES_256")
    nonce = os.urandom(12)
    ciphertext = AESGCM(dk["Plaintext"]).encrypt(nonce, data, None)
    # 復号時に KMS を呼ばずに済むよう、平文データキーを一緒に保存する
    return {"dataKey": dk["Plaintext"],
            "nonce": nonce, "ciphertext": ciphertext}</code></pre>`,
        why: `暗号化自体は成功しますが、平文のデータキーを暗号文と一緒に保存しているため、S3 の読み取り権限を持つ人なら誰でも KMS を経由せずに復号できます。KMS キーによるアクセス制御も CloudTrail への復号記録も機能せず、「平文のキーを永続化しない」要件に反します。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>エンベロープ暗号化</strong>: データはデータキーで暗号化し、データキーは KMS キーで暗号化する。KMS キーは KMS の外に出ず、保存するのは暗号化済みデータキーと暗号文。</li>
  <li><strong>API の使い分け</strong>: <code>Encrypt</code>（最大 4 KB の直接暗号化）、<code>GenerateDataKey</code>（平文 + 暗号化済みデータキー、すぐ暗号化する場合）、<code>GenerateDataKeyWithoutPlaintext</code>（暗号化済みデータキーのみ、後で使う場合）、<code>Decrypt</code>（対称キーでは <code>KeyId</code> は省略可能だが、指定するのがベストプラクティス）。</li>
  <li><strong>クライアント側 vs サーバー側暗号化</strong>: 本問は S3 に送る前に暗号化するクライアント側暗号化。実務では AWS Encryption SDK や Amazon S3 Encryption Client を使うと、エンベロープ暗号化とデータキーのキャッシュを安全に実装できる。S3 側で暗号化するなら SSE-KMS。</li>
  </ul>`,
    refs: [
      ["AWS KMS: エンベロープ暗号化", "https://docs.aws.amazon.com/kms/latest/developerguide/kms-cryptography.html#enveloping"],
      ["AWS KMS API: GenerateDataKey", "https://docs.aws.amazon.com/kms/latest/APIReference/API_GenerateDataKey.html"],
      ["AWS KMS API: Encrypt", "https://docs.aws.amazon.com/kms/latest/APIReference/API_Encrypt.html"],
      ["AWS KMS API: GenerateDataKeyWithoutPlaintext", "https://docs.aws.amazon.com/kms/latest/APIReference/API_GenerateDataKeyWithoutPlaintext.html"]
    ]
  }
  ]
});
