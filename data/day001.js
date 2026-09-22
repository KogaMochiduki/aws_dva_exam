/* DVA-C02 模擬試験 Day 001 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
window.DVA_EXAM = {
  day: "001",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・2・4 横断） ---------- */
  {
    id: "q1",
    domain: "分野1 開発 / 分野2 セキュリティ / 分野4 最適化",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>ある EC サイトの商品カタログ API は、Amazon API Gateway（REST API）→ AWS Lambda（Python）→ Amazon DynamoDB で構成されている。セール時に読み込みが急増し、人気商品への <code>GetItem</code> が特定のパーティションに集中してスロットリングとレイテンシの悪化が発生している。</p>
  <p>開発チームは、VPC のプライベートサブネットに作成済みの Amazon ElastiCache (Redis OSS) クラスターをキャッシュとして導入することにした。要件は次のとおりである。</p>
  <ul>
  <li>商品情報は管理画面から不定期に更新される。更新後、<strong>最大 5 分間</strong>は古い情報が返っても許容される。</li>
  <li>実際にリクエストされた商品だけをキャッシュする。キャッシュノードの再起動や置き換えでキャッシュが空になっても、API が存在する商品に対してエラーを返してはならない。</li>
  <li>Lambda 関数から ElastiCache と DynamoDB の両方に到達できること（この VPC には NAT ゲートウェイもインターネットゲートウェイ経由の経路もない）。</li>
  <li>DynamoDB のテーブル設計と API の仕様は変更しない。</li>
  </ul>
  <p>これらの要件をすべて満たすために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `Lambda の読み込み処理を次のように実装する。
  <pre><code>TTL_SECONDS = 300
  
  def get_product(product_id):
      key = f"product:{product_id}"
      cached = redis.get(key)
      if cached is not None:                       # キャッシュヒット
          return {"statusCode": 200, "body": cached}
  
      item = table.get_item(Key={"productId": product_id}).get("Item")
      if item is None:
          return {"statusCode": 404}
  
      body = json.dumps(item, default=str)         # Decimal を含むためシリアライズ
      redis.set(key, body, ex=TTL_SECONDS)         # 要求された項目だけを TTL 付きで格納
      return {"statusCode": 200, "body": body}</code></pre>`,
        why: `遅延読み込み（Lazy Loading / Cache-Aside）の正しい実装です。キャッシュミス時だけ DynamoDB を読み、結果を <code>ex=300</code>（TTL 5 分）付きで書き戻すため、「要求された商品だけをキャッシュ」「最大 5 分の古さを許容」の両方を満たします。キャッシュが空になっても DynamoDB から読み直すので 404 にはなりません。boto3 の resource API は数値を <code>Decimal</code> で返すため <code>default=str</code> でシリアライズしている点も実務的に正しい処理です。` },
      { correct: false, html: `Lambda の読み込み処理を次のように実装し、キャッシュへの書き込みは商品更新用の関数 <code>update_product()</code> だけが行う。
  <pre><code>def get_product(product_id):
      cached = redis.get(f"product:{product_id}")
      if cached is None:
          # キャッシュは update_product() が書き込むため、ここでは DB を参照しない
          return {"statusCode": 404}
      return {"statusCode": 200, "body": cached}</code></pre>`,
        why: `書き込み時にだけキャッシュを更新する Write-Through 方式を「読み込み側で DB にフォールバックしない」形で実装しています。ノードの再起動・置き換えやメモリ不足による追い出し（eviction）でキーが消えると、存在する商品でも 404 を返すため要件違反です。また、更新されない商品は永遠にキャッシュされず、「要求された商品だけをキャッシュ」という要件とも一致しません。Write-Through は通常 Lazy Loading と組み合わせて使います。` },
      { correct: false, html: `Lambda の読み込み処理を次のように実装する。
  <pre><code>def get_product(product_id):
      key = f"product:{product_id}"
      cached = redis.get(key)
      if cached is not None:
          return {"statusCode": 200, "body": cached}
  
      item = table.get_item(Key={"productId": product_id}).get("Item")
      if item is None:
          return {"statusCode": 404}
  
      body = json.dumps(item, default=str)
      redis.set(key, body)
      return {"statusCode": 200, "body": body}</code></pre>`,
        why: `Lazy Loading の骨格は正しいものの、<code>SET</code> に TTL（<code>ex</code>）がありません。更新時にキャッシュを削除する処理もないため、管理画面で商品を更新しても、キーが追い出されるまで古い情報が無期限に返り続け、「最大 5 分」の要件を満たせません。AWS のキャッシュ戦略ドキュメントでも、Lazy Loading の古いデータ問題には TTL の付与が推奨されています。` },
      { correct: true, html: `Lambda 関数に VPC 設定（ElastiCache に到達できるプライベートサブネットとセキュリティグループ）を追加し、ElastiCache 側のセキュリティグループで Lambda のセキュリティグループからの 6379/TCP を許可する。実行ロールには AWS 管理ポリシー <code>AWSLambdaVPCAccessExecutionRole</code> をアタッチする。`,
        why: `ElastiCache クラスターは VPC 内からしか到達できないため、Lambda を VPC に接続する必要があります。Lambda は VPC 接続時に Hyperplane ENI を作成するので、実行ロールに <code>ec2:CreateNetworkInterface</code> / <code>ec2:DescribeNetworkInterfaces</code> / <code>ec2:DeleteNetworkInterface</code> などの権限が必要です。<code>AWSLambdaVPCAccessExecutionRole</code> はこれらと CloudWatch Logs への書き込み権限を含む管理ポリシーです。` },
      { correct: true, html: `DynamoDB 用のゲートウェイ型 VPC エンドポイントを作成し、Lambda 関数を配置したサブネットのルートテーブルに関連付ける。`,
        why: `VPC に接続した Lambda 関数は、VPC の経路でしか外部に出られません。NAT ゲートウェイがない構成では DynamoDB のパブリックエンドポイントに到達できないため、DynamoDB のゲートウェイエンドポイント（追加料金なし）をルートテーブルに関連付けることで、プライベートサブネットから DynamoDB にアクセスできるようにします。` },
      { correct: false, html: `DynamoDB のパブリックエンドポイントに到達できるよう、Lambda 関数をインターネットゲートウェイへのルートを持つパブリックサブネットに接続する。`,
        why: `Lambda 関数をパブリックサブネットに接続しても、関数の ENI にはパブリック IP アドレスが割り当てられないため、インターネット（パブリックエンドポイント）には到達できません。Lambda のドキュメントにも「パブリックサブネットに接続してもインターネットアクセスやパブリック IP は得られない」と明記されています。VPC 内の Lambda から外部に出るには NAT ゲートウェイか VPC エンドポイントが必要です。` },
      { correct: false, html: `Lambda 関数は VPC に接続せず、ElastiCache クラスターにリソースベースポリシーを設定して Lambda 実行ロールの ARN からのアクセスを許可する。`,
        why: `ElastiCache にはリソースベースポリシーで VPC 外からのネットワークアクセスを許可する仕組みはありません（「一見できそうで実際は不可能」な構成）。ElastiCache (Redis OSS) 7 以降の IAM 認証は「接続したユーザーの認証」を IAM で行う機能であり、ネットワーク到達性は別問題です。VPC 外の Lambda からは到達できません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <p>この問題は「キャッシュ戦略の実装（分野1/分野4）」「Lambda からの VPC 内リソースアクセス（分野1）」「実行ロールの権限（分野2）」を横断しています。</p>
  <ul>
  <li><strong>Lazy Loading（Cache-Aside）</strong>: 読み込み時にキャッシュを確認し、ミスしたら DB から読んでキャッシュに書き込む。要求されたデータだけがキャッシュされ、ノード障害に強い。弱点は「古いデータ」と「ミス時の 3 往復」で、前者は TTL で緩和する。</li>
  <li><strong>Write-Through</strong>: 書き込み時にキャッシュも更新する。データは常に新しいが、読まれないデータもキャッシュされ、ノード喪失時にはデータが欠ける。単独ではなく Lazy Loading + TTL と併用するのが定石。</li>
  <li><strong>VPC 内の Lambda</strong>: VPC 接続すると外部へは VPC の経路でしか出られない。AWS サービス（DynamoDB/S3 はゲートウェイ型、その他は多くがインターフェイス型）へは VPC エンドポイント、インターネットへは NAT ゲートウェイが必要。</li>
  </ul>
  <p>なお、同一商品へのアクセス集中はパーティションキー設計（高カーディナリティ）でも緩和できますが、本問では「テーブル設計を変更しない」ため、読み込みをキャッシュで吸収するのが適切です。</p>`,
    refs: [
      ["ElastiCache: キャッシュ戦略（Lazy Loading / Write-Through / TTL）", "https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html"],
      ["Lambda: VPC 内のリソースへのアクセス", "https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html"],
      ["Lambda: VPC 接続関数のインターネットアクセス", "https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html"],
      ["DynamoDB 用ゲートウェイエンドポイント", "https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-ddb.html"]
    ]
  },
  
  /* ---------- Q2: セキュリティ（最小構成作業量） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ",
    tag: "最小限の構成作業量",
    type: "single", pick: 1,
    text: `
  <p>ある開発チームは、Amazon RDS for MySQL にユーザー名とパスワードで接続する AWS Lambda 関数（Node.js）を運用している。現在、DB の認証情報は Lambda の環境変数に平文で設定されている。セキュリティ監査の結果、次の対応を求められた。</p>
  <ul>
  <li>認証情報をコードや環境変数に平文で保持しない。</li>
  <li>認証情報を 30 日ごとに自動でローテーションする。</li>
  <li>ローテーション後、関数を再デプロイしなくても新しい認証情報が使われる。</li>
  <li>同時実行数が多いため、認証情報を取得する API の呼び出し回数とレイテンシを抑える。</li>
  </ul>
  <p>最小限の構成作業量でこれらの要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `認証情報を AWS Secrets Manager にシークレットとして格納し、Amazon RDS 用に AWS が提供するローテーション関数を使って 30 日間隔の自動ローテーションを有効にする。Lambda 関数に AWS Parameters and Secrets Lambda Extension のレイヤーを追加し、関数コードは拡張機能のローカル HTTP エンドポイント経由でシークレットを取得する。実行ロールには対象シークレットへの <code>secretsmanager:GetSecretValue</code> を許可する。`,
        why: `Secrets Manager は RDS 用のローテーション関数テンプレートを提供しており、スケジュールを指定するだけで自動ローテーションを構成できます。Parameters and Secrets Lambda Extension はシークレットを実行環境内でキャッシュ（TTL 付き）するため、呼び出しごとの <code>GetSecretValue</code> を減らしてレイテンシとコストを抑えられます。キャッシュは TTL 経過後に再取得されるので、ローテーション後も再デプロイは不要です。` },
      { correct: false, html: `認証情報を AWS Systems Manager Parameter Store の <code>SecureString</code> パラメータ（アドバンスド階層）に格納し、パラメータポリシーで 30 日ごとの自動ローテーションを設定する。関数コードは呼び出しごとに <code>GetParameter</code>（<code>WithDecryption=true</code>）で取得する。`,
        why: `Parameter Store のパラメータポリシーは <code>Expiration</code>（有効期限での削除）、<code>ExpirationNotification</code>、<code>NoChangeNotification</code> の 3 種類だけで、値を自動生成・更新するローテーション機能はありません。ローテーションするには自前の Lambda とスケジュールを作る必要があり、最小構成にもなりません。さらに呼び出しごとの取得は API 呼び出し削減の要件にも反します。` },
      { correct: false, html: `環境変数をカスタマー管理の AWS KMS キーで暗号化（暗号化ヘルパーを使用）し、関数コード内で <code>Decrypt</code> してから使用する。KMS キーの自動キーローテーションを有効にし、ローテーション期間を 30 日に設定する。`,
        why: `KMS の自動キーローテーションが更新するのは「暗号化キーのキーマテリアル」であり、暗号化されている DB パスワード自体は変わりません。また、自動ローテーション期間は 90〜2560 日の範囲でしか指定できないため 30 日は設定できません。暗号化は達成できても「認証情報のローテーション」要件は満たせません。` },
      { correct: false, html: `認証情報を AWS Secrets Manager に格納して 30 日間隔の自動ローテーションを有効にし、AWS SAM テンプレートで Lambda の環境変数に CloudFormation の動的参照 <code>{{resolve:secretsmanager:prod/db:SecretString:password}}</code> を指定してパスワードを渡す。`,
        why: `動的参照はスタックの作成・更新時に一度だけ解決されます。ローテーション後も環境変数には古いパスワードが残り、スタックを再デプロイするまで更新されません。さらに、解決された値は Lambda の環境変数として保存されるため、<code>GetFunctionConfiguration</code> やコンソールで参照可能になり、「環境変数に平文で保持しない」要件にも反します。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>自動ローテーションが組み込まれているのは Secrets Manager</strong>。Parameter Store には値のローテーション機能がない（パラメータポリシーは期限と通知のみ）。</li>
  <li><strong>KMS のキーローテーション ≠ シークレットのローテーション</strong>。KMS はキーマテリアルを更新するだけで、古いキーマテリアルも復号用に保持される。</li>
  <li><strong>取得のキャッシュ</strong>: Lambda では AWS Parameters and Secrets Lambda Extension（<code>localhost:2773</code>、リクエストヘッダー <code>X-Aws-Parameters-Secrets-Token</code> に <code>AWS_SESSION_TOKEN</code> を指定）や、各言語のキャッシュクライアントを使うと API 呼び出しを削減できる。</li>
  <li><strong>CloudFormation 動的参照</strong>はデプロイ時解決。ローテーションするシークレットをデプロイ時に値として埋め込むと追従できない。</li>
  </ul>`,
    refs: [
      ["Secrets Manager: シークレットのローテーション", "https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html"],
      ["Secrets Manager: Lambda 関数でのシークレット取得（Parameters and Secrets Lambda Extension）", "https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html"],
      ["Parameter Store: パラメータポリシー", "https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-policies.html"],
      ["AWS KMS: キーのローテーション", "https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html"],
      ["CloudFormation: 動的参照", "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references.html"]
    ]
  },
  
  /* ---------- Q3: デプロイ ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "最小限の構成作業量",
    type: "single", pick: 1,
    text: `
  <p>ある会社の注文処理 API は、AWS SAM テンプレートで定義された Lambda 関数を Amazon API Gateway から呼び出している。現在は <code>sam deploy</code> で新しいコードが即座に全トラフィックに適用されている。チームは次の要件を満たすデプロイ方式に変更したい。</p>
  <ul>
  <li>新しいバージョンにはまず 10% のトラフィックを 5 分間流し、問題がなければ残り 100% を切り替える。</li>
  <li>切り替え中に、関数のエラー数に対する Amazon CloudWatch アラームが ALARM 状態になった場合は、自動的に旧バージョンへロールバックする。</li>
  <li>トラフィックを移行する前に、検証用の Lambda 関数で新バージョンをテストする。</li>
  </ul>
  <p>既存の SAM テンプレートを活用し、最小限の構成作業量でこれらの要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `SAM テンプレートの関数リソースに <code>AutoPublishAlias: live</code> を追加し、<code>DeploymentPreference</code> で <code>Type: Canary10Percent5Minutes</code>、<code>Alarms</code> にエラー数の CloudWatch アラーム、<code>Hooks</code> の <code>PreTraffic</code> に検証用関数を指定する。API Gateway のイベントは関数のエイリアスを呼び出すようにし、<code>sam deploy</code> でデプロイする。`,
        why: `SAM の段階的デプロイ機能です。<code>AutoPublishAlias</code> によりコード変更のたびに新バージョンが発行されてエイリアスが更新され、<code>DeploymentPreference</code> を指定すると SAM が AWS CodeDeploy のアプリケーションとデプロイグループを自動作成します。Canary 方式のトラフィック移行、アラーム連動の自動ロールバック、PreTraffic/PostTraffic フックをテンプレートの数行で実現でき、最小構成です。` },
      { correct: false, html: `API Gateway のステージでカナリアリリースを有効にし、<code>percentTraffic</code> を 10 に設定する。エラー数の CloudWatch アラームを作成し、5 分後に問題がなければカナリアを昇格（promote）する。`,
        why: `API Gateway のカナリアリリースはステージ単位でトラフィックを分割できますが、CloudWatch アラームと連動した自動ロールバックや、トラフィック移行前に検証関数を実行するフックの仕組みはありません。昇格・ロールバックは手動（または自作の自動化）で行う必要があり、要件を満たせず、最小構成でもありません。` },
      { correct: false, html: `AWS CodeDeploy で Lambda 用のデプロイグループを作成し、デプロイ設定に <code>CodeDeployDefault.OneAtATime</code> を指定したインプレースデプロイを構成する。自動ロールバックの条件としてエラー数の CloudWatch アラームを登録する。`,
        why: `CodeDeploy の Lambda コンピューティングプラットフォームはエイリアスのトラフィック移行（Canary / Linear / AllAtOnce）のみをサポートし、インプレースデプロイはできません。<code>CodeDeployDefault.OneAtATime</code> は EC2/オンプレミス用のデプロイ設定であり、Lambda には使用できません（「一見できそうで不可能」な構成）。` },
      { correct: false, html: `関数に <code>live</code> エイリアスを作成し、<code>update-alias</code> の <code>--routing-config</code> で追加バージョンに <code>$LATEST</code> を指定して重み 0.1 を割り当てる。CloudWatch アラームを監視するスクリプトを作成し、アラーム時にはルーティング設定を削除する。`,
        why: `加重エイリアスのルーティング設定では、両方のバージョンが発行済みバージョンである必要があり、<code>$LATEST</code> を指定することはできません。仮に発行済みバージョンを使ったとしても、監視・切り替えスクリプトを自作することになり、最小構成ではありません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li>SAM の <code>AutoPublishAlias</code> + <code>DeploymentPreference</code> は、裏側で CodeDeploy を使った Lambda の段階的デプロイを自動構成する。</li>
  <li>デプロイタイプ: <code>Canary10Percent5Minutes</code> / <code>10Minutes</code> / <code>15Minutes</code> / <code>30Minutes</code>、<code>Linear10PercentEvery1Minute</code> / <code>2Minutes</code> / <code>3Minutes</code> / <code>10Minutes</code>、<code>AllAtOnce</code>。</li>
  <li><code>Hooks</code> の <code>PreTraffic</code> / <code>PostTraffic</code> 関数は、CodeDeploy の <code>PutLifecycleEventHookExecutionStatus</code> で Succeeded/Failed を報告する。フック関数の実行ロールにはこの API の権限が必要。</li>
  <li>Lambda の CodeDeploy はトラフィック移行（ブルー/グリーン型）のみで、インプレースは EC2/オンプレミス用。</li>
  </ul>`,
    refs: [
      ["AWS SAM: Lambda の段階的デプロイ", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/automating-updates-to-serverless-apps.html"],
      ["CodeDeploy: デプロイ設定（Lambda コンピューティングプラットフォーム）", "https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-configurations.html"],
      ["Lambda: エイリアスの加重ルーティング", "https://docs.aws.amazon.com/lambda/latest/dg/configuring-alias-routing.html"],
      ["API Gateway: カナリアリリース", "https://docs.aws.amazon.com/apigateway/latest/developerguide/canary-release.html"]
    ]
  },
  
  /* ---------- Q4: トラブルシューティング／オブザーバビリティ ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化",
    tag: "コード実装",
    type: "multi", pick: 2,
    text: `
  <p>マルチテナントの SaaS を構成する Lambda 関数（Node.js）では、AWS X-Ray のアクティブトレースが有効になっている。開発者は次の 2 つの要件を実装する必要がある。</p>
  <ul>
  <li>特定テナントの遅延を調査するため、X-Ray コンソールのフィルター式でテナント ID（<code>tenantId</code>）を指定してトレースを検索できるようにする。</li>
  <li>注文ごとに注文金額 <code>OrderValue</code> を、支払い方法 <code>PaymentMethod</code> をディメンションとするカスタムメトリクスとして Amazon CloudWatch に記録する。ただし、関数の処理経路に同期的な API 呼び出しを追加してはならない。</li>
  </ul>
  <p>これらの要件を満たす実装はどれですか。</p>`,
    options: [
      { correct: true, html: `X-Ray SDK でサブセグメントを作成し、<code>subsegment.addAnnotation('tenantId', tenantId)</code> でテナント ID を注釈として記録する。コンソールでは <code>annotation.tenantId = "t-001"</code> のフィルター式で検索する。`,
        why: `注釈（annotation）はインデックス化されるキーと値のペアで、フィルター式で検索できます。Lambda では関数セグメントは Lambda サービスが作成するため、関数コードから注釈を追加するにはサブセグメントを作成して記録します。` },
      { correct: true, html: `次のような JSON を標準出力に 1 行で書き出す。
  <pre><code>console.log(JSON.stringify({
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [{
        Namespace: "SaaS/Orders",
        Dimensions: [["PaymentMethod"]],
        Metrics: [{ Name: "OrderValue", Unit: "None" }]
      }]
    },
    PaymentMethod: order.paymentMethod,
    OrderValue: order.amount,
    tenantId: order.tenantId
  }));</code></pre>`,
        why: `CloudWatch Embedded Metric Format（EMF）です。Lambda の標準出力は CloudWatch Logs に送られ、EMF 形式のログは CloudWatch によって非同期にメトリクスとして抽出されます。関数内で <code>PutMetricData</code> を呼ばないため、処理経路に同期 API 呼び出しが増えません。ディメンションにしない <code>tenantId</code> はログのプロパティとして残るので、Logs Insights での調査にも使えます。` },
      { correct: false, html: `X-Ray SDK でサブセグメントを作成し、<code>subsegment.addMetadata('tenantId', tenantId)</code> でテナント ID をメタデータとして記録する。コンソールでは <code>metadata.tenantId = "t-001"</code> のフィルター式で検索する。`,
        why: `メタデータはインデックス化されないため、フィルター式で検索できません。任意のオブジェクトなど「トレースに保存したいが検索は不要」な情報を記録する用途です。検索したい値は注釈に記録します。` },
      { correct: false, html: `関数の処理ごとに AWS SDK の CloudWatch クライアントで <code>PutMetricData</code> を <code>await</code> で呼び出し、<code>OrderValue</code> を <code>PaymentMethod</code> ディメンション付きで送信する。`,
        why: `メトリクスの記録自体は可能ですが、呼び出しごとに同期的な API 呼び出しが処理経路に追加され、レイテンシ増加・スロットリング・API コストの原因になります。問題文の制約に反します。` },
      { correct: false, html: `Lambda 関数の環境変数 <code>AWS_XRAY_CONTEXT_MISSING</code> にテナント ID を設定し、X-Ray がトレースに自動でテナント ID を付与するようにする。`,
        why: `<code>AWS_XRAY_CONTEXT_MISSING</code> は、トレースコンテキストがない状態で計測コードが実行されたときの動作（<code>RUNTIME_ERROR</code> / <code>LOG_ERROR</code> / <code>IGNORE_ERROR</code>）を指定する環境変数です。任意の値をトレースに付与する機能はなく、そもそもテナント ID は呼び出しごとに変わるため環境変数では表現できません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>注釈 vs メタデータ</strong>: 注釈はインデックス化されフィルター式・グループで検索可能（1 トレースあたりの上限あり）。メタデータは検索不可で任意の型を保存できる。</li>
  <li><strong>Lambda と X-Ray</strong>: 関数セグメントは Lambda サービスが送信する。コードからは<strong>サブセグメント</strong>に注釈を追加する。</li>
  <li><strong>EMF</strong>: 構造化ログとカスタムメトリクスを 1 つの出力で実現できる。Powertools for AWS Lambda の Metrics ユーティリティや EMF クライアントライブラリを使うと簡単に出力できる。</li>
  <li>高カーディナリティな値（テナント ID、リクエスト ID など）をメトリクスのディメンションにするとメトリクス数とコストが増えるため、ログのプロパティや X-Ray の注釈として扱うのが定石。</li>
  </ul>
  <p>補足: 新規開発では X-Ray SDK の代わりに AWS Distro for OpenTelemetry（ADOT）や Powertools for AWS Lambda の Tracer の利用も推奨されていますが、「インデックス化された属性で検索する」という考え方は同じです。</p>`,
    refs: [
      ["X-Ray SDK for Node.js: 注釈とメタデータ", "https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-nodejs-segment.html"],
      ["X-Ray: フィルター式", "https://docs.aws.amazon.com/xray/latest/devguide/xray-console-filters.html"],
      ["CloudWatch Embedded Metric Format 仕様", "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html"],
      ["X-Ray SDK for Node.js: 環境変数", "https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-nodejs-configuration.html"]
    ]
  },
  
  /* ---------- Q5: 開発（メッセージング／Lambda エラー処理） ---------- */
  {
    id: "q5",
    domain: "分野1 開発",
    tag: "疑似コード・設定",
    type: "multi", pick: 2,
    text: `
  <p>Amazon SQS 標準キューに届く注文イベントを、イベントソースマッピング（バッチサイズ 10）経由で Lambda 関数（Python）が処理している。イベントソースマッピングでは <code>FunctionResponseTypes</code> に <code>ReportBatchItemFailures</code> が設定済みである。</p>
  <p>一部のメッセージは不正なデータを含み、処理に失敗し続ける。現在は 1 件でも失敗するとバッチ全体が再処理され、成功済みのメッセージが重複処理されている。チームは次の要件を満たしたい。</p>
  <ul>
  <li>バッチ内で処理に成功したメッセージは再処理されない。</li>
  <li>失敗したメッセージだけが再試行され、5 回受信しても失敗するメッセージは後で分析できるよう別の場所に退避される。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `ハンドラーを次のように実装する。
  <pre><code>def handler(event, context):
      failures = []
      for record in event["Records"]:
          try:
              process(json.loads(record["body"]))
          except Exception:
              logger.exception("process failed", extra={"messageId": record["messageId"]})
              failures.append({"itemIdentifier": record["messageId"]})
      return {"batchItemFailures": failures}</code></pre>`,
        why: `部分バッチレスポンスの正しい実装です。失敗したメッセージの <code>messageId</code> だけを <code>batchItemFailures</code> で返すと、Lambda は成功したメッセージをキューから削除し、失敗したメッセージだけを可視性タイムアウト後に再試行させます。空のリストを返せば全件成功として扱われます。` },
      { correct: false, html: `ハンドラーを次のように実装する。
  <pre><code>def handler(event, context):
      failures = []
      for record in event["Records"]:
          try:
              process(json.loads(record["body"]))
          except Exception:
              failures.append({"itemIdentifier": record["receiptHandle"]})
      return {"batchItemFailures": failures}</code></pre>`,
        why: `SQS の場合、<code>itemIdentifier</code> には <code>messageId</code> を指定する必要があります。存在しないメッセージ ID を返すと Lambda はレスポンス全体を無効と見なしてバッチ全体を失敗として扱うため、成功済みメッセージも再処理されます（Kinesis / DynamoDB Streams の場合はシーケンス番号を指定します）。` },
      { correct: false, html: `ハンドラーを次のように実装する。
  <pre><code>def handler(event, context):
      failed = 0
      for record in event["Records"]:
          try:
              process(json.loads(record["body"]))
          except Exception:
              failed += 1
      if failed &gt; 0:
          raise RuntimeError(f"{failed} records failed")</code></pre>`,
        why: `関数が例外をスローすると、<code>ReportBatchItemFailures</code> が有効でもバッチ全体が失敗として扱われ、成功したメッセージも含めて再処理されます。現在発生している問題そのものです。` },
      { correct: false, html: `ハンドラーを次のように実装する。
  <pre><code>def handler(event, context):
      failed_ids = []
      for record in event["Records"]:
          try:
              process(json.loads(record["body"]))
          except Exception:
              failed_ids.append(record["messageId"])
      if failed_ids:
          return {"statusCode": 500, "failedMessageIds": failed_ids}
      return {"statusCode": 200}</code></pre>`,
        why: `イベントソースマッピングは HTTP ステータスコードを解釈しません。<code>batchItemFailures</code> キーを含まないレスポンスは全件成功として扱われるため、失敗したメッセージもキューから削除されて失われます。` },
      { correct: true, html: `ソースの SQS キューに、同じ標準タイプのデッドレターキューを指定したリドライブポリシー（<code>maxReceiveCount: 5</code>）を設定する。`,
        why: `SQS をイベントソースとする場合、失敗メッセージの退避先はソースキューのリドライブポリシーで設定します。受信回数が <code>maxReceiveCount</code> を超えたメッセージは DLQ に移動されます。標準キューの DLQ は標準キューである必要があります。また、ソースキューの可視性タイムアウトは関数のタイムアウトの 6 倍以上にすることが推奨されています。` },
      { correct: false, html: `Lambda 関数の非同期呼び出し設定で、デッドレターキュー（<code>DeadLetterConfig</code>）に SQS キューを指定し、最大再試行回数を設定する。`,
        why: `関数の <code>DeadLetterConfig</code> や非同期呼び出しの再試行設定は、S3 や SNS などからの<strong>非同期呼び出し</strong>にのみ適用されます。SQS のイベントソースマッピングは Lambda がキューをポーリングして関数を同期的に呼び出すため、この設定は使われません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>部分バッチレスポンス</strong>: <code>ReportBatchItemFailures</code> を有効にし、失敗した項目の ID を <code>{"batchItemFailures": [{"itemIdentifier": ...}]}</code> で返す。SQS は <code>messageId</code>、Kinesis / DynamoDB Streams はシーケンス番号。</li>
  <li>バッチ全体が失敗扱いになるケース: 関数が例外をスローした、JSON が不正、<code>itemIdentifier</code> が空文字・null・キー名誤り、存在しないメッセージ ID を返した、など。</li>
  <li><strong>失敗の退避先はイベントソースによって異なる</strong>: 非同期呼び出しは関数の DLQ / 失敗時の送信先、SQS のイベントソースマッピングはソースキューの DLQ（リドライブポリシー）。</li>
  <li>標準キューは少なくとも 1 回の配信のため、処理は冪等に実装する（Powertools for AWS Lambda の Idempotency / Batch ユーティリティも有用）。</li>
  </ul>`,
    refs: [
      ["Lambda: SQS イベントソースのエラー処理と部分バッチレスポンス", "https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html"],
      ["Amazon SQS: デッドレターキュー", "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html"],
      ["Lambda: 非同期呼び出しの失敗レコードの保持", "https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-retain-records.html"]
    ]
  }
  ]
};
