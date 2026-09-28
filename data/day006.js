/* DVA-C02 模擬試験 Day 006 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "006",
  date: "2026-09-29",
  title: "署名付き URL アップロードと S3 イベント・クライアント側暗号化・CloudFormation の置き換え対策・Lambda のログレベル・SQS FIFO",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・2 横断） ---------- */
  {
    id: "q1",
    domain: "分野1 開発 / 分野2 セキュリティ",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>ある写真共有アプリでは、Amazon Cognito ユーザープールでサインインしたユーザーが、最大 10 MB の画像をアップロードする。開発者は次の構成を設計している。</p>
  <ul>
  <li>アプリは、Cognito ユーザープールのオーソライザーを設定した API Gateway（REST API）の <code>POST /upload-url</code> を呼び出し、Lambda 関数 <code>issue-url</code> からアップロード用の署名付きリクエストを受け取る。</li>
  <li>アプリはその署名付きリクエストを使って、画像を Amazon S3 バケット <code>photos</code> に<strong>直接</strong>アップロードする。バケットのデフォルト暗号化は、カスタマーマネージドキー <code>photos-key</code> による SSE-KMS である。</li>
  <li>アップロードされると、サムネイルを作成する Lambda 関数が<strong>非同期</strong>で処理する。</li>
  </ul>
  <p>要件は次のとおりである。</p>
  <ul>
  <li>ユーザーは、自分用のプレフィックス <code>uploads/&lt;ユーザーの sub&gt;/</code> の下にだけアップロードできる。</li>
  <li>10 MB を超えるファイルは S3 側で拒否する。署名付きリクエストの有効期間は 15 分とする。</li>
  <li>アップロードのイベントは、カスタマーマネージドキーで暗号化した Amazon SQS キューにいったん格納し、サムネイル作成関数がキューから処理する。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `<code>issue-url</code> 関数を次のように実装する。
  <pre><code>claims = event["requestContext"]["authorizer"]["claims"]
key = f"uploads/{claims['sub']}/{uuid.uuid4()}.jpg"
post = s3.generate_presigned_post(
    Bucket="photos",
    Key=key,
    Fields={"Content-Type": "image/jpeg"},
    Conditions=[
        ["content-length-range", 1, 10 * 1024 * 1024],
        {"Content-Type": "image/jpeg"},
    ],
    ExpiresIn=900,
)
return {"statusCode": 200, "body": json.dumps(post)}</code></pre>`,
        why: `ユーザーの識別子は、API Gateway の Cognito オーソライザーが検証済みの ID トークンから取り出した <code>requestContext.authorizer.claims</code> から取得しています。クライアントが改ざんできないので、プレフィックスの制限に使えます。オブジェクトキーはサーバー側で決めて署名しています。署名付き POST のポリシーで <code>content-length-range</code> 条件を指定すると、範囲外のサイズのアップロードは S3 が拒否します。<code>ExpiresIn=900</code> で有効期間は 15 分です。` },
      { correct: false, html: `<code>issue-url</code> 関数を次のように実装する。
  <pre><code>body = json.loads(event["body"])
url = s3.generate_presigned_url(
    "put_object",
    Params={"Bucket": "photos", "Key": body["key"]},
    ExpiresIn=900,
)
return {"statusCode": 200, "body": json.dumps({"url": url})}</code></pre>`,
        why: `オブジェクトキーをリクエスト本文からそのまま受け取って署名しているため、ユーザーは他のユーザーのプレフィックスを含む任意のキーの署名付き URL を取得できます。また、この署名付き PUT URL にはサイズの制約が含まれていないので、10 MB を超えるファイルも拒否できません。` },
      { correct: true, html: `<code>issue-url</code> 関数の実行ロールに、<code>arn:aws:s3:::photos/uploads/*</code> への <code>s3:PutObject</code> と、<code>photos-key</code> への <code>kms:GenerateDataKey</code> を許可する。`,
        why: `署名付きリクエストでアクセスするときに使われるのは、<strong>署名した IAM プリンシパル（ここでは関数の実行ロール）の権限</strong>です。署名したロールに <code>s3:PutObject</code> がなければアップロードは拒否されます。SSE-KMS のバケットに書き込むには、データキーを生成するための <code>kms:GenerateDataKey</code> も必要です。なお、一時的な認証情報で署名した場合は、その認証情報が失効した時点で署名付きリクエストも無効になります。` },
      { correct: false, html: `署名付きリクエスト自体にアップロードの権限が含まれるため、<code>issue-url</code> 関数の実行ロールには S3 の権限を付けない。最小権限の原則に従い、実行ロールには CloudWatch Logs への書き込み権限だけを付ける。`,
        why: `署名付き URL やリクエストは権限を新たに作り出すものではなく、<strong>署名したプリンシパルの権限を一時的に貸し出す</strong>ものです。署名したロールに権限がなければ、URL の生成には成功しても、アップロード時に <code>AccessDenied</code>（403）になります。` },
      { correct: true, html: `SQS キューを、<code>s3.amazonaws.com</code> に <code>kms:GenerateDataKey</code> と <code>kms:Decrypt</code> を許可するキーポリシーを持つカスタマーマネージドキーで暗号化する。キューのアクセスポリシーでは、<code>aws:SourceArn</code> がバケット <code>photos</code> の場合に限り、<code>s3.amazonaws.com</code> の <code>sqs:SendMessage</code> を許可する。そのうえで、バケットの <code>s3:ObjectCreated:*</code> イベント（プレフィックス <code>uploads/</code>）の通知先をこのキューにし、サムネイル作成関数のイベントソースマッピングを設定する。`,
        why: `S3 のイベント通知が SQS キューに送信するには、キューのアクセスポリシーで S3 のサービスプリンシパルに <code>sqs:SendMessage</code> を許可する必要があります。<code>aws:SourceArn</code>（と <code>aws:SourceAccount</code>）で送信元を限定すると、混乱した代理（confused deputy）問題を防げます。キューが SSE-KMS で暗号化されている場合、S3 はメッセージを暗号化するためにキーを使うので、キーポリシーで S3 に <code>kms:GenerateDataKey</code> と <code>kms:Decrypt</code> を許可します。` },
      { correct: false, html: `SQS キューを AWS マネージドキー <code>aws/sqs</code> で暗号化し、キューのアクセスポリシーで <code>s3.amazonaws.com</code> に <code>sqs:SendMessage</code> を許可する。`,
        why: `AWS マネージドキー <code>aws/sqs</code> のキーポリシーは<strong>変更できません</strong>。S3 などのサービスが暗号化されたキューにイベントを送るには、そのサービスのプリンシパルにキーの使用を許可する必要があるため、カスタマーマネージドキーを作成してキーポリシーに追加しなければなりません（一見できそうで不可能な構成）。要件の「カスタマーマネージドキーで暗号化」にも合いません。` },
      { correct: false, html: `署名付きリクエストは使わず、API Gateway のバイナリメディアタイプを設定して、アプリから <code>POST /upload</code> に画像を送る。Lambda プロキシ統合の関数が本文を受け取って S3 に <code>PutObject</code> する。`,
        why: `Lambda の同期呼び出しのリクエストペイロードは最大 <strong>6 MB</strong> です。さらに、バイナリは API Gateway で Base64 エンコードされて約 1.33 倍の大きさになるため、10 MB の画像は関数に渡せません。大きなファイルは、署名付き URL で S3 に直接アップロードするのが定石です。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <p>この問題は「API と SDK を使ったコード（分野1）」「イベント駆動の非同期処理（分野1）」「ベアラートークンとサービス間の認可・暗号化（分野2）」を横断しています。</p>
  <ul>
  <li><strong>署名付き URL / POST</strong>: 権限は署名したプリンシパルのもので、有効期限は指定した時間か認証情報の失効のうち早いほう。SDK で作る場合、IAM ユーザーの認証情報なら最長 7 日。</li>
  <li><strong>署名付き PUT と POST</strong>: POST ポリシーでは <code>content-length-range</code>、<code>starts-with</code> などの条件でアップロード内容を制限できる。</li>
  <li><strong>認可情報の出どころ</strong>: ユーザーの識別子は検証済みトークンのクレーム（Cognito オーソライザーなら <code>requestContext.authorizer.claims</code>）から取り、リクエスト本文の値を信用しない。</li>
  <li><strong>S3 イベント通知の送信先</strong>: SNS / SQS / Lambda / EventBridge。SNS と SQS は送信先側のリソースポリシーで S3 を許可し、暗号化している場合はカスタマーマネージドキーのキーポリシーでも S3 を許可する。通知は少なくとも 1 回配信なので、処理側は冪等にする。</li>
  </ul>`,
    refs: [
      ["Amazon S3: 署名付き URL によるオブジェクトのアップロードとダウンロード", "https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html"],
      ["Amazon S3: イベント通知の送信先へのアクセス許可", "https://docs.aws.amazon.com/AmazonS3/latest/userguide/grant-destinations-permissions-to-s3.html"],
      ["Amazon SQS: キー管理（AWS サービスの KMS アクセス許可）", "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-key-management.html"],
      ["Lambda: クォータ（呼び出しペイロード）", "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html"],
      ["API Gateway: Cognito ユーザープールによるアクセス制御", "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html"]
    ]
  },

  /* ---------- Q2: セキュリティ（クライアント側暗号化） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ",
    tag: "暗号化方式の選択",
    type: "single", pick: 1,
    text: `
  <p>ある医療機関の予約システムは、DynamoDB テーブル <code>Appointments</code>（パーティションキー <code>patientId</code>、ソートキー <code>appointmentAt</code>）に予約を保存している。項目には、診療内容を記録した属性 <code>diagnosis</code>（PHI）が含まれる。</p>
  <p>セキュリティ監査で次の要件が示された。</p>
  <ul>
  <li>運用チームのデータベース管理者は、テーブルに対する <code>dynamodb:*</code> 権限を持ち続ける。ただし、管理者が項目を読み取っても <code>diagnosis</code> の平文は見えてはならない。</li>
  <li>アプリケーションは、これまでどおり <code>patientId</code> と <code>appointmentAt</code> で予約を検索できなければならない。</li>
  <li>暗号化には AWS KMS のキーを使い、復号できるのはアプリケーションの実行ロールだけとする。</li>
  </ul>
  <p>これらの要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `アプリケーションに AWS Database Encryption SDK for DynamoDB を組み込み、KMS キーリングを使ってクライアント側で暗号化する。属性の暗号化アクションは、<code>diagnosis</code> を <code>ENCRYPT_AND_SIGN</code>、<code>patientId</code> と <code>appointmentAt</code> を <code>SIGN_ONLY</code> にする。KMS キーのキーポリシーでは、アプリケーションの実行ロールにだけ <code>kms:Decrypt</code> を許可する。`,
        why: `クライアント側暗号化では、データはアプリケーション内で暗号化されてから DynamoDB に送られます。<code>GetItem</code> などで読み取っても、返ってくるのは暗号文です。復号にはキーリングの KMS キーが必要なので、キーポリシーで許可されていない管理者には平文が見えません。主キーは署名の対象にするだけ（<code>SIGN_ONLY</code>）で平文のまま保存されるため、キーを使った検索もこれまでどおり行えます。` },
      { correct: false, html: `テーブルの保管時の暗号化で、AWS 所有キーの代わりにカスタマーマネージドキーを使うように変更する。キーポリシーでは、アプリケーションの実行ロールにだけ <code>kms:Decrypt</code> を許可する。`,
        why: `DynamoDB の保管時の暗号化（サーバー側暗号化）は<strong>透過的</strong>に行われます。テーブルへの読み取り権限を持つプリンシパルがリクエストすると、DynamoDB が復号して平文を返します。キーの使用はテーブル単位で DynamoDB が行うため、属性ごとに特定の人から平文を隠すことはできません。` },
      { correct: false, html: `AWS Database Encryption SDK for DynamoDB を使い、<code>diagnosis</code> に加えて <code>patientId</code> と <code>appointmentAt</code> も <code>ENCRYPT_AND_SIGN</code> にして、患者を特定できる情報をすべて暗号化する。`,
        why: `主キー（パーティションキーとソートキー）の属性は<strong>暗号化できません</strong>（一見できそうで不可能な構成）。DynamoDB が項目を格納・検索するにはキーの値が必要なので、主キーには <code>SIGN_ONLY</code> か <code>SIGN_AND_INCLUDE_IN_ENCRYPTION_CONTEXT</code> を指定します。キーの値を秘匿したい場合は、キー設計を見直す（ハッシュ化した値を使うなど）必要があります。` },
      { correct: false, html: `アプリケーションが DynamoDB を呼び出すときに TLS 1.2 以上を必須とし、DynamoDB の VPC エンドポイントを経由するように構成する。`,
        why: `TLS は<strong>転送中</strong>のデータを保護するもので、DynamoDB に保存された後の値は保護しません。VPC エンドポイントも通信経路を制御するだけです。<code>dynamodb:*</code> 権限を持つ管理者は、これまでどおり平文を読み取れます。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>サーバー側暗号化</strong>: サービスが保存時に暗号化し、権限のあるリクエストには復号して返す。ディスクやバックアップの保護が目的で、アクセス権を持つ人からデータを隠すことはできない。</li>
  <li><strong>クライアント側暗号化</strong>: データを送る前にアプリケーションで暗号化する。サービスやその管理者も平文を見られない（エンドツーエンドの保護）。代わりに、暗号化された属性では検索や条件式が使えなくなる。</li>
  <li><strong>Database Encryption SDK の暗号化アクション</strong>: <code>ENCRYPT_AND_SIGN</code>（暗号化して署名）、<code>SIGN_ONLY</code>（署名のみ）、<code>SIGN_AND_INCLUDE_IN_ENCRYPTION_CONTEXT</code>、<code>DO_NOTHING</code>。機密データは <code>ENCRYPT_AND_SIGN</code>、主キーは <code>SIGN_ONLY</code> などにする。暗号化された属性を検索したい場合はビーコン（検索可能な暗号化）を使う。</li>
  <li>エンベロープ暗号化で属性ごとにデータキーを使い、データキーは KMS キー（ラッピングキー）で保護される。</li>
  </ul>`,
    refs: [
      ["AWS Database Encryption SDK: 概念（暗号化アクション）", "https://docs.aws.amazon.com/database-encryption-sdk/latest/devguide/concepts.html"],
      ["AWS Database Encryption SDK: クライアント側とサーバー側の暗号化", "https://docs.aws.amazon.com/database-encryption-sdk/latest/devguide/client-server-side.html"],
      ["DynamoDB: 保管時の暗号化", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EncryptionAtRest.html"]
    ]
  },

  /* ---------- Q3: デプロイ（CloudFormation のリソース置き換え） ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "IaC テンプレートの更新",
    type: "multi", pick: 2,
    text: `
  <p>開発者は、AWS SAM で管理している本番スタックの DynamoDB テーブル <code>OrdersTable</code>（<code>TableName</code> は指定していない）に、アクセスパターンの変更に合わせてソートキーを追加することにした。<code>KeySchema</code> の変更はリソースの<strong>置き換え</strong>が必要な更新である。</p>
  <p>要件は次のとおりである。</p>
  <ul>
  <li>更新を実行する前に、どのリソースが置き換えられるかを確認する。</li>
  <li>スタックの更新で新しいテーブルが作成された後も、データを移行するために、旧テーブルとそのデータを削除せずに残す。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `<code>sam deploy --confirm-changeset</code>（または CloudFormation の変更セット）で更新内容を作成し、実行前に <code>OrdersTable</code> の変更で <code>Replacement</code> が <code>True</code> になっていることを確認する。`,
        why: `変更セットを使うと、スタックを実際に更新する前に、追加・変更・削除されるリソースと、変更が置き換えを伴うかどうか（<code>Replacement</code>: <code>True</code> / <code>False</code> / <code>Conditional</code>）を確認できます。<code>sam deploy</code> は内部で変更セットを作成し、<code>--confirm-changeset</code> を付けると実行前に確認を求めます。` },
      { correct: true, html: `<code>OrdersTable</code> リソースに <code>UpdateReplacePolicy: Retain</code> を追加する（スタック削除時にも残すため <code>DeletionPolicy: Retain</code> も併せて設定する）。`,
        why: `<code>UpdateReplacePolicy</code> は、スタックの更新でリソースが<strong>置き換えられたときに旧リソースをどうするか</strong>を指定する属性です。<code>Retain</code> にすると、新しいテーブルが作成された後も旧テーブルは削除されず、スタックの管理から外れた状態で残ります。` },
      { correct: false, html: `<code>OrdersTable</code> リソースに <code>DeletionPolicy: Retain</code> だけを追加する。`,
        why: `<code>DeletionPolicy</code> が適用されるのは、スタックの削除や、テンプレートからリソースを取り除いたときです。<strong>更新による置き換えには適用されず</strong>、置き換えで作られた新しいテーブルと入れ替わった旧テーブルは削除されます。置き換え時に残すには <code>UpdateReplacePolicy</code> が必要です。` },
      { correct: false, html: `<code>OrdersTable</code> リソースに <code>DeletionPolicy: Snapshot</code> と <code>UpdateReplacePolicy: Snapshot</code> を追加し、旧テーブルのスナップショットを取得してから置き換えさせる。`,
        why: `<code>Snapshot</code> ポリシーをサポートしているのは、EBS ボリューム、RDS、Aurora（DB クラスター）、ElastiCache、Neptune、Redshift、DocumentDB などのリソースで、<strong><code>AWS::DynamoDB::Table</code> は含まれません</strong>（一見できそうで不可能な構成）。DynamoDB のデータを保護するには、<code>Retain</code> やポイントインタイムリカバリ、オンデマンドバックアップを使います。` },
      { correct: false, html: `スタックの削除保護（termination protection）を有効にし、スタックの更新でテーブルが削除されないようにする。`,
        why: `削除保護が防ぐのは<strong>スタック自体の削除</strong>だけです。スタックの更新でリソースが置き換えや削除されることは防げません。` },
      { correct: false, html: `スタックのドリフト検出を実行し、<code>OrdersTable</code> が置き換えられるかどうかを確認する。`,
        why: `ドリフト検出は、スタックのリソースの実際の設定が、CloudFormation の外で行われた変更によってテンプレートの定義と食い違っていないかを調べる機能です。これから行う更新でリソースが置き換えられるかどうかは、変更セットで確認します。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>更新の動作</strong>: プロパティの変更には「中断なし」「一部中断あり」「置き換え」があり、リソースタイプのリファレンスの各プロパティに「Update requires」として記載されている。DynamoDB の <code>KeySchema</code> や <code>TableName</code> の変更は置き換えになる。</li>
  <li><strong>名前を指定したリソース</strong>: <code>TableName</code> などで名前を固定したリソースは、置き換えが必要な更新ができない（同じ名前のリソースを 2 つ作れないため）。</li>
  <li><strong>DeletionPolicy と UpdateReplacePolicy</strong>: 前者はスタックの削除やテンプレートからの削除、後者は更新による置き換えのときに使われる。値は <code>Delete</code> / <code>Retain</code> / <code>Snapshot</code>（対応リソースのみ）。<code>DeletionPolicy</code> には <code>RetainExceptOnCreate</code> もある。</li>
  <li><strong>そのほかの保護</strong>: スタックポリシー（特定リソースの更新や置き換えを拒否する）、削除保護（スタックの削除を防ぐ）、変更セット（事前確認）を目的に合わせて使い分ける。</li>
  </ul>`,
    refs: [
      ["CloudFormation: UpdateReplacePolicy 属性", "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-updatereplacepolicy.html"],
      ["CloudFormation: DeletionPolicy 属性", "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-deletionpolicy.html"],
      ["CloudFormation: 変更セットによるスタックの更新", "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets.html"],
      ["AWS SAM CLI: sam deploy", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-deploy.html"]
    ]
  },

  /* ---------- Q4: トラブルシューティング（Lambda の高度なログ設定） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化",
    tag: "最小限の構成作業量",
    type: "single", pick: 1,
    text: `
  <p>ある Lambda 関数（Python 3.12）は、標準の <code>logging</code> ライブラリで次のようにログを出力している。コード内で <code>setLevel()</code> は呼び出していない。</p>
  <pre><code>import logging
logger = logging.getLogger()

def handler(event, context):
    logger.debug("request detail: %s", event)
    logger.info("order accepted")
    logger.warning("stock is low")</code></pre>
  <p>関数は AWS SAM のパラメータ <code>Stage</code> で、開発環境と本番環境の 2 つのスタックにデプロイしている。運用チームから次の要望があった。</p>
  <ul>
  <li>ログを JSON 形式の構造化ログにし、各ログに呼び出しのリクエスト ID を含める。</li>
  <li>開発環境では DEBUG 以上、本番環境では WARN 以上のログだけを CloudWatch Logs に送る（本番のログ取り込み量を減らす）。</li>
  <li>関数のコードは変更しない。</li>
  </ul>
  <p>最小限の構成作業量でこの要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `SAM テンプレートの関数の <code>LoggingConfig</code> で <code>LogFormat: JSON</code> を指定し、<code>ApplicationLogLevel</code> を <code>Stage</code> パラメータに応じて <code>DEBUG</code> または <code>WARN</code> に設定する。`,
        why: `Lambda の高度なログ設定を使うと、対応ランタイムで標準の <code>logging</code> ライブラリを使っていれば、コードを変更せずにアプリケーションログを JSON 形式で出力できます。Python の場合は <code>timestamp</code>、<code>level</code>、<code>message</code>、<code>requestId</code> が自動で含まれます。<code>ApplicationLogLevel</code> を設定すると、それより詳細なレベルのログは CloudWatch Logs に送られません。` },
      { correct: false, html: `ログ形式はテキストのまま、<code>LoggingConfig</code> の <code>ApplicationLogLevel</code> だけを <code>Stage</code> パラメータに応じて <code>DEBUG</code> または <code>WARN</code> に設定する。`,
        why: `ログレベルでのフィルタリングを使うには、ログ形式を <strong>JSON</strong> にする必要があります（一見できそうで不可能な構成）。テキスト形式のままではアプリケーションログのレベルを設定できず、JSON の構造化ログという要件も満たせません。` },
      { correct: false, html: `関数の環境変数 <code>LOG_LEVEL</code> を <code>Stage</code> パラメータに応じて <code>DEBUG</code> または <code>WARN</code> に設定する。`,
        why: `Python の標準 <code>logging</code> ライブラリは、<code>LOG_LEVEL</code> という環境変数を自動では読み取りません。環境変数を使うなら、その値を読んで <code>setLevel()</code> を呼ぶコードの変更が必要です（Powertools for AWS Lambda の Logger などは環境変数に対応しています）。JSON 形式にする要件も満たせません。` },
      { correct: false, html: `本番環境のロググループに、<code>WARN</code> と <code>ERROR</code> を含むログイベントだけに一致するサブスクリプションフィルターを設定し、それ以外のログを除外する。`,
        why: `サブスクリプションフィルターは、一致したログイベントを Kinesis、Firehose、Lambda などに<strong>転送する</strong>機能です。ロググループへの取り込み自体は変わらないため、INFO や DEBUG のログも保存され、取り込み量は減りません。JSON 形式にする要件も満たせません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>ログ形式</strong>: 既定はテキスト形式。JSON にすると、システムログ（<code>platform.start</code>、<code>platform.report</code> など）とアプリケーションログの両方が JSON になる。</li>
  <li><strong>ログレベルのフィルタリング</strong>: JSON 形式が前提。アプリケーションログは TRACE〜FATAL、システムログは DEBUG / INFO / WARN から選ぶ。コード内で <code>setLevel()</code> を呼んでいる場合は、コードの設定が優先される。</li>
  <li><strong>ロググループ</strong>: 既定の <code>/aws/lambda/&lt;関数名&gt;</code> 以外に、任意のロググループを指定して複数の関数のログをまとめることもできる。</li>
  <li><strong>ログ・メトリクス・トレース</strong>: 構造化ログは Logs Insights で検索しやすく、EMF でメトリクスを、X-Ray でトレースを取れば、オブザーバビリティの 3 本柱がそろう。</li>
  </ul>`,
    refs: [
      ["Lambda: JSON 形式とテキスト形式のログ", "https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-logformat.html"],
      ["Lambda: ログレベルのフィルタリング", "https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-log-level.html"],
      ["CloudWatch Logs: サブスクリプションフィルター", "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Subscriptions.html"]
    ]
  },

  /* ---------- Q5: 開発（SQS FIFO） ---------- */
  {
    id: "q5",
    domain: "分野1 開発",
    tag: "メッセージングのコード",
    type: "multi", pick: 2,
    text: `
  <p>ある EC サイトの注文サービスは、注文を Amazon SQS FIFO キュー <code>orders.fifo</code> に送信し、在庫サービスが処理している。メッセージ本文は次の形式で、送信時刻 <code>sentAt</code> を含む。</p>
  <pre><code>{ "orderId": "o-1001", "customerId": "c-42", "items": [...], "sentAt": "2026-09-29T10:15:30.123Z" }</code></pre>
  <p>要件は次のとおりである。</p>
  <ul>
  <li>同じ顧客の注文は送信順に処理する。異なる顧客の注文は並行して処理し、スループットを確保する。</li>
  <li>注文サービスはネットワークエラー時に同じ注文を再送することがある。再送されたメッセージ（<code>sentAt</code> だけが異なる）は二重に処理しない。</li>
  <li>キャンセルを受け付けるため、どの注文も送信から 60 秒経つまでは処理を開始しない。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `注文サービスで次のようにメッセージを送信する。
  <pre><code>sqs.send_message(
    QueueUrl=ORDERS_FIFO_URL,
    MessageBody=json.dumps(order),
    MessageGroupId=order["customerId"],
    MessageDeduplicationId=order["orderId"],
)</code></pre>`,
        why: `FIFO キューは、同じ <code>MessageGroupId</code> のメッセージを順番どおりに 1 つずつ配信し、異なるグループのメッセージは並行して処理できます。顧客 ID をグループ ID にすれば、顧客ごとの順序と全体の並列性を両立できます。<code>MessageDeduplicationId</code> に注文 ID を指定すると、5 分間の重複排除期間内に同じ ID で送られたメッセージは受け付けられても配信されません。` },
      { correct: true, html: `キュー <code>orders.fifo</code> の配信遅延（キュー属性の <code>DelaySeconds</code>）を 60 秒に設定する。`,
        why: `遅延キューを設定すると、キューに送られたすべてのメッセージが指定した秒数（最大 15 分）の間、コンシューマーから見えなくなります。キュー単位の遅延は FIFO キューでもサポートされています。` },
      { correct: false, html: `<code>send_message</code> の呼び出しで、メッセージごとに <code>DelaySeconds=60</code> を指定する。`,
        why: `FIFO キューは、<strong>メッセージごとの遅延（メッセージタイマー）をサポートしていません</strong>（一見できそうで不可能な構成）。FIFO キューで遅延させたい場合は、キュー全体の <code>DelaySeconds</code> を設定します。` },
      { correct: false, html: `すべてのメッセージの <code>MessageGroupId</code> を固定値 <code>"orders"</code> にし、キューの全注文が送信順に処理されるようにする。`,
        why: `すべてのメッセージが 1 つのメッセージグループに入るため、キュー全体で 1 件ずつしか処理されません。前のメッセージの処理が終わるまで次のメッセージが配信されないので、異なる顧客の注文を並行処理するという要件を満たせず、スループットが大きく下がります。` },
      { correct: false, html: `キューのコンテンツベースの重複排除を有効にし、<code>MessageDeduplicationId</code> は指定しない。`,
        why: `コンテンツベースの重複排除は、<strong>メッセージ本文の SHA-256 ハッシュ</strong>を重複排除 ID として使います。再送されたメッセージは <code>sentAt</code> が異なり本文のハッシュも変わるため、重複として扱われず、同じ注文が二重に処理されます。業務上の一意キーで重複を判断したい場合は、<code>MessageDeduplicationId</code> を明示的に指定します。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>FIFO キューの基本</strong>: キュー名は <code>.fifo</code> で終わる。送信時には <code>MessageGroupId</code> が必須。順序はメッセージグループ単位で保証される。</li>
  <li><strong>重複排除</strong>: 5 分間の重複排除期間内に同じ重複排除 ID のメッセージが送られると、2 通目以降は配信されない。ID は明示的に指定するか、コンテンツベースの重複排除（本文のハッシュ）を使う。</li>
  <li><strong>遅延</strong>: 標準キューはキュー単位の遅延とメッセージタイマーの両方を使える。FIFO キューはキュー単位の遅延だけ。15 分を超える予約実行には EventBridge Scheduler を使う。</li>
  <li><strong>コンシューマー側の冪等性</strong>: 重複排除期間を過ぎた再送や、処理中の失敗による再配信に備えて、処理側でも冪等にしておく。</li>
  </ul>`,
    refs: [
      ["Amazon SQS: FIFO キュー", "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html"],
      ["Amazon SQS: FIFO キューでの 1 回だけの処理", "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html"],
      ["Amazon SQS: メッセージタイマー", "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-message-timers.html"],
      ["Amazon SQS: 遅延キュー", "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-delay-queues.html"]
    ]
  }
  ]
});
