/* DVA-C02 模擬試験 Day 010 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "010",
  date: "2026-10-04",
  title: "ECS ブルー/グリーンの検証フック・MFA 付き一時認証情報・CloudFormation のクロススタック参照・DynamoDB のスロットリング分析・楽観的ロック",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・3・4 横断） ---------- */
  {
    id: "q1",
    domain: "分野3 デプロイ / 分野1 開発 / 分野4 トラブルシューティングと最適化",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>ある会社の注文 API は、Amazon ECS（AWS Fargate）のサービスとして稼働しており、Application Load Balancer（ALB）の背後にある。デプロイには AWS CodeDeploy のブルー/グリーンデプロイ（ECS コンピューティングプラットフォーム）を使っている。ALB には次の 2 つのリスナーがある。</p>
  <ul>
  <li>本番リスナー: HTTPS 443（利用者のトラフィック）</li>
  <li>テストリスナー: HTTP 8080（社内からのみアクセス可能）</li>
  </ul>
  <p>先月、新しいバージョンに DB 接続設定の誤りがあり、トラフィックの切り替え直後から全リクエストが失敗する障害が起きた。再発を防ぐため、開発者は次の要件でデプロイを見直すことになった。</p>
  <ul>
  <li><strong>本番トラフィックを 1 件も流す前に</strong>、新しいタスクセットに対して自動のスモークテストを実行し、失敗したらデプロイを止めて元に戻す。</li>
  <li>テストに合格したら、まず本番トラフィックの 10% を新しいタスクセットに流し、5 分後に残りの 90% を切り替える。</li>
  <li>切り替え中に ALB の 5xx エラーが急増したら、自動的に元のタスクセットへ戻す。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>3 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `AppSpec ファイルを次のように記述し、テストリスナーへのトラフィックが新しいタスクセットに向いた後のフックで、検証用の Lambda 関数を実行する。
  <pre><code>version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "arn:aws:ecs:ap-northeast-1:111122223333:task-definition/order-api:42"
        LoadBalancerInfo:
          ContainerName: "order-api"
          ContainerPort: 8000
Hooks:
  - AfterAllowTestTraffic: "SmokeTestHook"</code></pre>`,
        why: `ECS のデプロイで使えるフックは <code>BeforeInstall</code>、<code>AfterInstall</code>、<code>AfterAllowTestTraffic</code>、<code>BeforeAllowTraffic</code>、<code>AfterAllowTraffic</code> の 5 つで、どれも Lambda 関数を指定します。<code>AfterAllowTestTraffic</code> は、<strong>テストリスナーが新しいタスクセット（置き換えタスクセット）にトラフィックを流し始めた後、本番トラフィックを切り替える前</strong>に実行されます。ここでテストが失敗すると、ロールバックのきっかけになります。` },
      { correct: true, html: `検証用の Lambda 関数 <code>SmokeTestHook</code> を次のように実装し、実行ロールには <code>codedeploy:PutLifecycleEventHookExecutionStatus</code> を許可する。
  <pre><code>import boto3, urllib.request

codedeploy = boto3.client("codedeploy")
TEST_URL = "http://internal-order-alb.example.local:8080/health/deep"

def handler(event, context):
    status = "Failed"
    try:
        with urllib.request.urlopen(TEST_URL, timeout=10) as res:
            if res.status == 200:
                status = "Succeeded"
    except Exception as e:
        print(f"smoke test error: {e}")
    codedeploy.put_lifecycle_event_hook_execution_status(
        deploymentId=event["DeploymentId"],
        lifecycleEventHookExecutionId=event["LifecycleEventHookExecutionId"],
        status=status,
    )</code></pre>`,
        why: `CodeDeploy はフックの Lambda 関数を呼び出した後、関数から <strong><code>PutLifecycleEventHookExecutionStatus</code> で結果（<code>Succeeded</code> / <code>Failed</code>）が報告されるのを待ちます</strong>。イベントに含まれる <code>DeploymentId</code> と <code>LifecycleEventHookExecutionId</code> をそのまま渡します。テストリスナー（8080）経由で呼び出すので、テスト対象は新しいタスクセットです。例外が起きても必ず <code>Failed</code> を報告するようにしているため、デプロイがすぐに失敗扱いになりロールバックされます。` },
      { correct: true, html: `デプロイグループのデプロイ設定を <code>CodeDeployDefault.ECSCanary10Percent5Minutes</code> にする。ALB の <code>HTTPCode_Target_5XX_Count</code> に CloudWatch アラームを作成してデプロイグループに関連付け、自動ロールバックの条件として「デプロイが失敗したとき」と「アラームのしきい値に達したとき」を有効にする。`,
        why: `<code>ECSCanary10Percent5Minutes</code> は、最初に 10% を切り替え、5 分後に残りの 90% を切り替える ECS 用の定義済み設定です。デプロイグループに CloudWatch アラームを関連付けて、アラームによる自動ロールバックを有効にすると、切り替え中にアラームが ALARM 状態になった時点でデプロイが停止し、元のタスクセットに戻ります。フックのテスト失敗でもロールバックさせるには、「デプロイが失敗したとき」のロールバックも有効にしておきます。` },
      { correct: false, html: `AppSpec ファイルの <code>Hooks</code> に <code>ValidateService: "SmokeTestHook"</code> を追加し、新しいタスクが起動した直後にスモークテストを実行する。`,
        why: `<code>ValidateService</code> は <strong>EC2/オンプレミスのデプロイ専用</strong>のライフサイクルイベントで、インスタンス上のスクリプトを実行するためのものです（一見できそうで不可能な構成）。ECS のデプロイの AppSpec ファイルでは使えません。ECS では、<code>AfterInstall</code> や <code>AfterAllowTestTraffic</code> などのフックで Lambda 関数を指定します。` },
      { correct: false, html: `検証用の Lambda 関数では、テストの結果に応じて <code>return {"status": "Succeeded"}</code> または <code>return {"status": "Failed"}</code> を返す。CodeDeploy は関数の戻り値を読み取って、次のステップに進むかどうかを判断する。`,
        why: `CodeDeploy は<strong>関数の戻り値を結果として使いません</strong>。<code>PutLifecycleEventHookExecutionStatus</code> が呼ばれない限り、フックは完了しません。1 時間以内に結果が報告されないとデプロイは失敗扱いになるため、テストが成功していてもデプロイが長時間止まったうえで失敗します。` },
      { correct: false, html: `デプロイグループのデプロイ設定を <code>CodeDeployDefault.LambdaCanary10Percent5Minutes</code> にする。ECS でも Lambda でも、トラフィックの切り替え方は同じなので共通で使える。`,
        why: `定義済みのデプロイ設定は<strong>コンピューティングプラットフォームごとに分かれています</strong>。<code>LambdaCanary10Percent5Minutes</code> は Lambda のエイリアスの重み付けに使う設定で、ECS のデプロイグループには指定できません（一見できそうで不可能な構成）。ECS では <code>ECSCanary10Percent5Minutes</code> などの <code>ECS</code> で始まる設定を使います。` },
      { correct: false, html: `<code>BeforeInstall</code> フックで検証用の Lambda 関数を実行し、本番リスナー（443）の URL にリクエストを送ってスモークテストを行う。`,
        why: `<code>BeforeInstall</code> は<strong>置き換えタスクセットが作成される前</strong>に実行されるため、新しいバージョンはまだ存在しません。また、本番リスナーはこの時点で元のタスクセットに向いているので、テストしているのは旧バージョンです。新しいタスクセットを本番トラフィックの前にテストするには、テストリスナー経由で <code>AfterAllowTestTraffic</code> フックを使います。` }
    ],
    explanation: `
  <h4>ECS のブルー/グリーンデプロイの流れ</h4>
  <table style="border-collapse:collapse;width:100%;font-size:0.92em">
  <tr><th style="border:1px solid #ccc;padding:4px 8px;text-align:left">ライフサイクルイベント</th><th style="border:1px solid #ccc;padding:4px 8px;text-align:left">タイミング</th></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px"><code>BeforeInstall</code></td><td style="border:1px solid #ccc;padding:4px 8px">置き換えタスクセットの作成前（ロールバック不可）</td></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px">Install</td><td style="border:1px solid #ccc;padding:4px 8px">置き換えタスクセットを作成（フック不可）</td></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px"><code>AfterInstall</code></td><td style="border:1px solid #ccc;padding:4px 8px">置き換えタスクセットの作成後</td></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px">AllowTestTraffic</td><td style="border:1px solid #ccc;padding:4px 8px">テストリスナーを置き換えタスクセットへ（フック不可）</td></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px"><code>AfterAllowTestTraffic</code></td><td style="border:1px solid #ccc;padding:4px 8px">テストトラフィックでの検証に最適</td></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px"><code>BeforeAllowTraffic</code></td><td style="border:1px solid #ccc;padding:4px 8px">本番トラフィックの切り替え前</td></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px">AllowTraffic</td><td style="border:1px solid #ccc;padding:4px 8px">デプロイ設定（カナリア/線形/一括）に従って本番トラフィックを切り替え（フック不可）</td></tr>
  <tr><td style="border:1px solid #ccc;padding:4px 8px"><code>AfterAllowTraffic</code></td><td style="border:1px solid #ccc;padding:4px 8px">本番トラフィックの切り替え後</td></tr>
  </table>
  <h4>ポイント</h4>
  <ul>
  <li><strong>フックの Lambda 関数</strong>: イベントの <code>DeploymentId</code> と <code>LifecycleEventHookExecutionId</code> を使って <code>PutLifecycleEventHookExecutionStatus</code> を呼び、結果を報告する。1 時間以内に報告がないとデプロイは失敗する。実行ロールにはこの API の許可が必要。</li>
  <li><strong>デプロイ設定</strong>: ECS 用は <code>ECSCanary10Percent5Minutes</code> / <code>ECSCanary10Percent15Minutes</code> / <code>ECSLinear10PercentEvery1Minutes</code> / <code>ECSLinear10PercentEvery3Minutes</code> / <code>ECSAllAtOnce</code>。Network Load Balancer では <code>ECSAllAtOnce</code> だけ。</li>
  <li><strong>自動ロールバック</strong>: デプロイグループで「失敗時」「アラームのしきい値到達時」を設定できる。ロールバックは、直前の正常なリビジョンを新しいデプロイとして再デプロイする仕組み。</li>
  <li>EC2/オンプレミス用のイベント（<code>ApplicationStop</code>、<code>ApplicationStart</code>、<code>ValidateService</code> など）はスクリプトを実行するもので、ECS や Lambda のデプロイでは使えない。</li>
  </ul>`,
    refs: [
      ["CodeDeploy: AppSpec の hooks セクション", "https://docs.aws.amazon.com/codedeploy/latest/userguide/reference-appspec-file-structure-hooks.html"],
      ["CodeDeploy: AppSpec の resources セクション", "https://docs.aws.amazon.com/codedeploy/latest/userguide/reference-appspec-file-structure-resources.html"],
      ["CodeDeploy: チュートリアル（検証テスト付きの ECS デプロイ）", "https://docs.aws.amazon.com/codedeploy/latest/userguide/tutorial-ecs-deployment-with-hooks.html"],
      ["CodeDeploy: デプロイ設定", "https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-configurations.html"],
      ["CodeDeploy: 再デプロイとロールバック", "https://docs.aws.amazon.com/codedeploy/latest/userguide/deployments-rollback-and-redeploy.html"]
    ]
  },

  /* ---------- Q2: セキュリティ（MFA 付きのプログラムによるアクセス） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ",
    tag: "疑似コード",
    type: "single", pick: 1,
    text: `
  <p>開発者は、検証用の DynamoDB テーブルを整理する Python スクリプトを、自分の IAM ユーザーのアクセスキー（長期的な認証情報）で実行している。管理者は、誤操作を防ぐため、この IAM ユーザーに次のポリシーを適用した。</p>
  <pre><code>{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dynamodb:DeleteTable", "dynamodb:DeleteItem"],
    "Resource": "arn:aws:dynamodb:ap-northeast-1:111122223333:table/dev-*",
    "Condition": { "Bool": { "aws:MultiFactorAuthPresent": "true" } }
  }]
}</code></pre>
  <p>適用後、スクリプトの <code>DeleteTable</code> が <code>AccessDeniedException</code> で失敗するようになった。開発者には仮想 MFA デバイス（<code>arn:aws:iam::111122223333:mfa/dev-user</code>）が割り当てられている。</p>
  <p>このポリシーの意図（MFA で認証したときだけ削除できる）を保ったまま、スクリプトから削除できるようにするには、どのように実装すればよいですか。</p>`,
    options: [
      { correct: true, html: `<pre><code>import boto3

code = input("MFA code: ")
creds = boto3.client("sts").get_session_token(
    SerialNumber="arn:aws:iam::111122223333:mfa/dev-user",
    TokenCode=code,
    DurationSeconds=3600,
)["Credentials"]

ddb = boto3.client(
    "dynamodb",
    aws_access_key_id=creds["AccessKeyId"],
    aws_secret_access_key=creds["SecretAccessKey"],
    aws_session_token=creds["SessionToken"],
)
ddb.delete_table(TableName="dev-orders")</code></pre>`,
        why: `<code>aws:MultiFactorAuthPresent</code> キーは、<strong>MFA 情報を含む一時的な認証情報</strong>でリクエストしたときだけ <code>true</code> になります。長期的なアクセスキーでの呼び出しには、このキーそのものが含まれません。<code>GetSessionToken</code> に MFA デバイスの ARN（<code>SerialNumber</code>）とワンタイムパスワード（<code>TokenCode</code>）を渡すと、MFA 情報を含む一時的な認証情報が返されます。この認証情報（セッショントークンを含む 3 つ）でクライアントを作れば、条件を満たして削除できます。` },
      { correct: false, html: `<pre><code>import boto3

creds = boto3.client("sts").get_session_token(
    DurationSeconds=3600
)["Credentials"]

ddb = boto3.client(
    "dynamodb",
    aws_access_key_id=creds["AccessKeyId"],
    aws_secret_access_key=creds["SecretAccessKey"],
    aws_session_token=creds["SessionToken"],
)
ddb.delete_table(TableName="dev-orders")</code></pre>`,
        why: `<code>GetSessionToken</code> は MFA 情報なしでも呼び出せ、一時的な認証情報が返されます。しかし、その認証情報のセッションには<strong>MFA で認証したという情報が含まれない</strong>ため、<code>aws:MultiFactorAuthPresent</code> は <code>true</code> になりません。結果は変わらず <code>AccessDeniedException</code> です。` },
      { correct: false, html: `<pre><code>import boto3

code = input("MFA code: ")
creds = boto3.client("sts").get_federation_token(
    Name="dev-user",
    PolicyArns=[{"arn": "arn:aws:iam::111122223333:policy/DevTableAdmin"}],
    SerialNumber="arn:aws:iam::111122223333:mfa/dev-user",
    TokenCode=code,
)["Credentials"]
# 以降は一時的な認証情報で delete_table を呼ぶ</code></pre>`,
        why: `<code>GetFederationToken</code> には <strong><code>SerialNumber</code> や <code>TokenCode</code> のパラメータがなく、MFA に対応していません</strong>（一見できそうで不可能な実装）。MFA 情報を渡せる STS の API は <code>GetSessionToken</code> と <code>AssumeRole</code> だけです。このコードはパラメータの検証エラーになります。` },
      { correct: false, html: `スクリプトは変更せず、管理者にポリシーの条件を <code>"BoolIfExists": { "aws:MultiFactorAuthPresent": "true" }</code> に変更してもらう。`,
        why: `<code>...IfExists</code> 演算子は、<strong>キーが存在しない場合に条件を true と評価</strong>します。長期的なアクセスキーでのリクエストには <code>aws:MultiFactorAuthPresent</code> が含まれないため、MFA なしでも削除できてしまいます。エラーは消えますが、「MFA で認証したときだけ削除できる」というポリシーの意図が失われます。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>MFA で保護された API アクセス</strong>は、一時的な認証情報でだけ使える。<code>GetSessionToken</code> または <code>AssumeRole</code> の呼び出し時に MFA デバイスの ID とワンタイムパスワードを渡す。</li>
  <li><code>aws:MultiFactorAuthPresent</code> は、長期的な認証情報（アクセスキー）でのリクエストには<strong>存在しない</strong>。<code>Bool</code> で <code>true</code> を要求すると、アクセスキーでのリクエストは拒否される。</li>
  <li><code>aws:MultiFactorAuthAge</code> を数値条件で使うと、「MFA 認証から 1 時間以内」のように期間も制限できる。</li>
  <li><code>GetSessionToken</code> は、同じアカウント内の API を MFA 付きで呼び出す用途に使う。別アカウントのリソースには、MFA 条件付きの信頼ポリシーを持つロールを <code>AssumeRole</code> で引き受ける。</li>
  <li>CLI では、<code>aws sts get-session-token --serial-number ... --token-code ...</code> の結果を環境変数（<code>AWS_ACCESS_KEY_ID</code>、<code>AWS_SECRET_ACCESS_KEY</code>、<code>AWS_SESSION_TOKEN</code>）に設定して使う。</li>
  </ul>`,
    refs: [
      ["IAM: MFA による API アクセスの保護", "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html"],
      ["STS API リファレンス: GetSessionToken", "https://docs.aws.amazon.com/STS/latest/APIReference/API_GetSessionToken.html"],
      ["STS API リファレンス: GetFederationToken", "https://docs.aws.amazon.com/STS/latest/APIReference/API_GetFederationToken.html"],
      ["IAM: 条件キーの存在をチェックする条件演算子", "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition_operators.html"]
    ]
  },

  /* ---------- Q3: デプロイ（CloudFormation のクロススタック参照） ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "IaC テンプレートの更新",
    type: "multi", pick: 2,
    text: `
  <p>ある開発チームは、CloudFormation で 2 種類のスタックを管理している。<code>shared</code> スタックは DynamoDB テーブルと SNS トピックを作成して出力をエクスポートし、<code>app</code> スタックの Lambda 関数がそれらを <code>Fn::ImportValue</code> で参照している。どちらのスタックも同じアカウント・同じリージョンにある。</p>
  <pre><code># shared スタックの Outputs（抜粋）
Outputs:
  OrdersTableName:
    Value: !Ref OrdersTable
    Export:
      Name: OrdersTableName</code></pre>
  <p>次の 2 つの問題が発生している。</p>
  <ol>
  <li>テーブル名を変更するため <code>shared</code> スタックを更新したところ、「Cannot update export OrdersTableName as it is in use by app」というエラーで更新が失敗した。</li>
  <li>同じアカウント・同じリージョンに、ステージング用の <code>shared-stg</code> スタックを同じテンプレートから作成したところ、エクスポート名が既に存在するというエラーで失敗した。</li>
  </ol>
  <p>これらの問題を解決するための方法として正しいものはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `先に <code>app</code> スタックを更新して <code>Fn::ImportValue</code> による参照を外し（一時的にパラメータで値を渡すなど）、その後で <code>shared</code> スタックを更新する。更新後に <code>app</code> スタックで再びインポートする。`,
        why: `ほかのスタックがインポートしているエクスポートは、<strong>値の変更も削除もできません</strong>。また、エクスポートしているスタック自体も削除できません。どのスタックがインポートしているかは <code>aws cloudformation list-imports</code> やコンソールの「エクスポート」で確認できます。インポートをすべて外してから、エクスポートを変更します。` },
      { correct: true, html: `エクスポート名にスタック名を含めて一意にし、インポート側はパラメータで参照先のスタック名を受け取る。
  <pre><code># shared テンプレート
    Export:
      Name: !Sub "\${AWS::StackName}-OrdersTableName"

# app テンプレート
Parameters:
  SharedStackName:
    Type: String
...
      TABLE_NAME:
        Fn::ImportValue: !Sub "\${SharedStackName}-OrdersTableName"</code></pre>`,
        why: `エクスポート名は、<strong>アカウントごと・リージョンごとに一意</strong>でなければなりません。同じテンプレートから複数のスタックを作る場合は、<code>AWS::StackName</code> 疑似パラメータを名前に含めるのが定石です。<code>Fn::ImportValue</code> の中では、リソースに依存しない <code>Fn::Sub</code> やパラメータの <code>Ref</code> を使えます。YAML では短縮形 <code>!ImportValue</code> の中に短縮形 <code>!Sub</code> を書けないため、外側は完全な関数名 <code>Fn::ImportValue</code> にしています。` },
      { correct: false, html: `エクスポート名を、テーブルの物理名を使って一意にする。
  <pre><code>    Export:
      Name: !Sub "\${OrdersTable}-export"</code></pre>`,
        why: `エクスポートの <code>Name</code> には、<strong>リソースに依存する <code>Ref</code> や <code>GetAtt</code> を使えません</strong>（一見できそうで不可能な構成）。<code>\${OrdersTable}</code> はリソースの <code>Ref</code> と同じ意味になるため、テンプレートの検証で失敗します。スタック名などの疑似パラメータやテンプレートのパラメータを使います。` },
      { correct: false, html: `<code>shared</code> スタックの <code>Outputs</code> に <code>UpdateReplacePolicy: Retain</code> を指定すれば、使用中のエクスポートでも値を変更できるようになる。`,
        why: `<code>UpdateReplacePolicy</code> や <code>DeletionPolicy</code> は<strong>リソースに指定する属性</strong>で、更新や削除で置き換えられた物理リソースを残すかどうかを決めるものです。出力やエクスポートには指定できず、使用中のエクスポートの制約を回避する手段もありません。` },
      { correct: false, html: `<code>Fn::ImportValue</code> の値はスタックの更新のたびに自動で再評価されるので、<code>shared</code> スタックの更新時に <code>--force</code> オプションを付ければ、<code>app</code> スタックの Lambda 関数の環境変数も新しいテーブル名に自動で更新される。`,
        why: `CloudFormation の <code>update-stack</code> に、使用中のエクスポートの変更を強制するオプションはありません。また、エクスポートの値が変わっても、インポートしている側のスタックが自動で更新されることはありません。インポート側の値は、そのスタックを更新したときに解決されます。` },
      { correct: false, html: `<code>Fn::ImportValue</code> の代わりに、<code>app</code> テンプレートで <code>Fn::GetAtt: [shared, Outputs.OrdersTableName]</code> と書き、ほかのスタックの出力を直接参照する。`,
        why: `<code>Fn::GetAtt</code> は<strong>同じテンプレート内のリソース</strong>の属性を取得する関数で、独立した別のスタックを指定することはできません。<code>Outputs.名前</code> の形式で出力を参照できるのは、同じテンプレート内でネストされたスタック（<code>AWS::CloudFormation::Stack</code> リソース）を作成した場合だけです。` }
    ],
    explanation: `
  <h4>クロススタック参照の制約（Export / Fn::ImportValue）</h4>
  <ul>
  <li>エクスポート名は、アカウントごと・リージョンごとに一意。</li>
  <li>参照できるのは、<strong>同じアカウント・同じリージョン</strong>のスタックだけ。</li>
  <li>エクスポートの <code>Name</code> と <code>Fn::ImportValue</code> には、リソースに依存する <code>Ref</code> / <code>GetAtt</code> を使えない。</li>
  <li>インポートされているエクスポートは、値の変更・削除ができず、エクスポート元のスタックも削除できない（強い参照）。</li>
  </ul>
  <h4>ほかの選択肢</h4>
  <ul>
  <li><strong>ネストされたスタック</strong>: 親スタックの中で子スタックをまとめて管理し、子の出力を <code>!GetAtt 子スタック.Outputs.名前</code> で別の子に渡せる。共有の範囲がそのスタックのグループ内に限られる場合に向く。</li>
  <li><strong><code>Fn::GetStackOutput</code></strong>: エクスポートを宣言せずにほかのスタックの出力を参照でき、クロスアカウント・クロスリージョンにも対応する。ただし弱い参照で、参照先の削除や変更は防がれない。</li>
  <li>SSM パラメータストアに値を書き込み、テンプレートのパラメータ型 <code>AWS::SSM::Parameter::Value&lt;String&gt;</code> で読む方法もよく使われる。</li>
  </ul>`,
    refs: [
      ["CloudFormation: スタックのエクスポートされた出力の取得", "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-stack-exports.html"],
      ["CloudFormation: Fn::ImportValue", "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/intrinsic-function-reference-importvalue.html"],
      ["CloudFormation: Fn::GetStackOutput", "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/intrinsic-function-reference-getstackoutput.html"],
      ["CloudFormation: ネストされたスタック", "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-nested-stacks.html"]
    ]
  },

  /* ---------- Q4: トラブルシューティング（DynamoDB のスロットリング） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化 / 分野1 開発",
    tag: "原因の特定",
    type: "multi", pick: 2,
    text: `
  <p>ある IoT アプリケーションは、約 5,000 台のセンサーから送られる測定値を DynamoDB テーブル <code>SensorReadings</code> に書き込んでいる。テーブルの設計と状況は次のとおりである。</p>
  <ul>
  <li>パーティションキー: <code>readingDate</code>（例: <code>2026-10-04</code>）、ソートキー: <code>deviceId#timestamp</code></li>
  <li>プロビジョニングモード: 書き込みキャパシティ 5,000 WCU（項目はすべて 1 KB 未満）</li>
  <li>主な読み取りパターン: 「指定した日付の全センサーの測定値を取得する」日次の集計処理</li>
  </ul>
  <p>ピーク時の書き込みは毎秒約 2,500 件だが、CloudWatch では <code>ConsumedWriteCapacityUnits</code> が 1 秒あたり約 1,000 で頭打ちになり、<code>WriteThrottleEvents</code> が多発している。</p>
  <p>原因を特定し、日次の集計処理を維持したままスロットリングを解消するために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `テーブルで CloudWatch Contributor Insights を有効にし、「最もスロットリングされたキー」のグラフで、スロットリングが特定のパーティションキーの値に集中していることを確認する。`,
        why: `DynamoDB の CloudWatch Contributor Insights は、<strong>最もアクセスされた項目と最もスロットリングされた項目</strong>のキーをグラフで表示します。テーブル全体のメトリクスでは分からない「どのキーが原因か」を特定できます。スロットリングだけを対象にするモード（throttled keys モード）もあり、常時有効にしても低コストです。` },
      { correct: true, html: `パーティションキーを <code>readingDate#N</code>（N は 0〜9 の乱数またはデバイス ID から計算した値）にして書き込みを分散する。集計処理では、その日の 10 個のパーティションキーに対して <code>Query</code> を並列に実行して結果をまとめる。`,
        why: `その日の書き込みがすべて同じパーティションキーの値に集中しているため、<strong>1 つのパーティションの上限（毎秒 1,000 WCU）</strong>に達しています。テーブル全体のキャパシティに余裕があっても、1 つのキーの値に書き込める量は増えません。サフィックスを付けて書き込みを分散する（書き込みシャーディング）と、上限が実質 10 倍になり、日付単位の <code>Query</code> も維持できます。` },
      { correct: false, html: `書き込みキャパシティを 10,000 WCU に増やす。`,
        why: `消費量はプロビジョニングした 5,000 WCU を大きく下回っており、テーブル全体のキャパシティは不足していません。<strong>1 つのパーティションキーの値が使えるのは毎秒最大 1,000 WCU</strong> なので、キャパシティを増やしても、同じキーへの書き込みは引き続きスロットリングされます。` },
      { correct: false, html: `テーブルをオンデマンドモードに変更する。オンデマンドモードではパーティションごとの上限がなくなり、1 つのパーティションキーにいくらでも書き込める。`,
        why: `オンデマンドモードでも、<strong>パーティションごとの上限（毎秒 1,000 WCU / 3,000 RCU）は変わりません</strong>（一見できそうで不可能な構成）。キャパシティの見積もりは不要になりますが、1 つのキーに集中する書き込みの問題は解決しません。` },
      { correct: false, html: `<code>deviceId</code> をパーティションキーとする GSI を作成する。書き込みが GSI のパーティションに分散されるため、ベーステーブルのスロットリングが解消される。`,
        why: `GSI は、ベーステーブルへの書き込みを<strong>非同期でコピー</strong>するものです。ベーステーブルへの書き込みは、引き続き <code>readingDate</code> の同じ値に集中します。GSI を追加すると、GSI 側の書き込みキャパシティの消費も増えます。` },
      { correct: false, html: `アプリケーションとテーブルの間に DynamoDB Accelerator（DAX）を配置する。書き込みが DAX のキャッシュに吸収されるため、テーブルへの書き込みが減る。`,
        why: `DAX の書き込みは<strong>ライトスルー</strong>で、DynamoDB への書き込みが成功してからキャッシュを更新します。テーブルへの書き込み量は減らないので、書き込みのスロットリングは解決しません。DAX は読み取りの遅延を短縮するためのサービスです。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>パーティションの上限</strong>: 1 つのパーティションは毎秒最大 3,000 RCU と 1,000 WCU。プロビジョニングモードでもオンデマンドモードでも同じ。テーブル全体に余裕があるのにスロットリングされる場合は、ホットパーティション（特定のキーへの集中）を疑う。</li>
  <li><strong>高カーディナリティのパーティションキー</strong>: 日付やステータスのように値の種類が少ない属性は、アクセスが偏りやすい。デバイス ID やユーザー ID のように値の種類が多い属性を選ぶか、サフィックスで分散する。</li>
  <li><strong>書き込みシャーディング</strong>: 乱数のサフィックスは書き込みの分散に優れるが、項目を 1 件ずつ読むときにどのシャードか分からない。デバイス ID のハッシュなど、計算で求められるサフィックスにすると、特定の項目も直接読める。</li>
  <li><strong>CloudWatch Contributor Insights for DynamoDB</strong>: 最もアクセスされたキー・最もスロットリングされたキーを可視化する。テーブルと GSI ごとに有効化できる。キーの値が CloudWatch に送られるため、キーに機密情報を含む場合は注意する。</li>
  </ul>`,
    refs: [
      ["DynamoDB: CloudWatch Contributor Insights の仕組み", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/contributorinsights_HowItWorks.html"],
      ["DynamoDB: パーティションキーの設計のベストプラクティス", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html"],
      ["DynamoDB: 書き込みシャーディング", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-sharding.html"],
      ["DynamoDB: DAX の書き込み（ライトスルー）", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.consistency.html"]
    ]
  },

  /* ---------- Q5: 開発（楽観的ロック） ---------- */
  {
    id: "q5",
    domain: "分野1 開発",
    tag: "疑似コード",
    type: "single", pick: 1,
    text: `
  <p>あるショッピングアプリケーションは、ユーザーのカートを DynamoDB テーブル <code>Carts</code>（パーティションキー <code>userId</code>）に 1 項目として保存している。カートの更新では、現在のカートを読み取り、アプリケーションで割引やクーポンの適用条件を計算してから、カート全体を書き戻している。</p>
  <p>同じユーザーがスマートフォンと PC で同時にカートを更新すると、一方の変更が上書きされて消える問題（更新の消失）が報告された。開発者は、項目に数値の属性 <code>version</code> を追加し、楽観的ロックで解決することにした。要件は次のとおりである。</p>
  <ul>
  <li>ほかのクライアントが先に更新していた場合は、書き込みを行わない。</li>
  <li>競合した場合は、最新のカートで計算し直して再試行する（最大 3 回）。</li>
  </ul>
  <p>要件を満たす正しい実装はどれですか。</p>`,
    options: [
      { correct: true, html: `<pre><code>for attempt in range(3):
    item = table.get_item(Key={"userId": uid},
                          ConsistentRead=True)["Item"]
    current = item["version"]
    new_cart = apply_change(item["cart"], change)
    try:
        table.update_item(
            Key={"userId": uid},
            UpdateExpression="SET cart = :c, version = :next",
            ConditionExpression="version = :cur",
            ExpressionAttributeValues={
                ":c": new_cart, ":cur": current, ":next": current + 1},
        )
        return new_cart
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        time.sleep(random.uniform(0, 0.1 * 2 ** attempt))
raise ConflictError("cart was updated concurrently")</code></pre>`,
        why: `読み取ったときの <code>version</code> と同じであることを条件に書き込み、同時に <code>version</code> を 1 つ増やしています。ほかのクライアントが先に更新していれば <code>version</code> が変わっているため、条件が満たされず <code>ConditionalCheckFailedException</code> になり、書き込みは行われません。競合したときは<strong>ループの先頭で最新の項目を読み直し</strong>、計算し直してから再試行します。待機時間にジッター付きの指数バックオフを使っているため、同時に再試行が集中しにくくなります。` },
      { correct: false, html: `<pre><code>for attempt in range(3):
    item = table.get_item(Key={"userId": uid})["Item"]
    new_cart = apply_change(item["cart"], change)
    try:
        table.update_item(
            Key={"userId": uid},
            UpdateExpression="SET cart = :c, version = version + :one",
            ConditionExpression="attribute_exists(userId)",
            ExpressionAttributeValues={":c": new_cart, ":one": 1},
        )
        return new_cart
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        time.sleep(0.1 * 2 ** attempt)</code></pre>`,
        why: `<code>attribute_exists(userId)</code> は「項目が存在すること」を確認しているだけで、<strong>読み取った後にほかのクライアントが更新したかどうかは確認していません</strong>。<code>version</code> は増えますが、比較に使っていないため、後から書き込んだ側が先の変更を上書きします。更新の消失は解決しません。` },
      { correct: false, html: `<pre><code>item = table.get_item(Key={"userId": uid},
                      ConsistentRead=True)["Item"]
new_cart = apply_change(item["cart"], change)
table.put_item(Item={
    "userId": uid,
    "cart": new_cart,
    "version": item["version"] + 1,
})</code></pre>`,
        why: `強い整合性のある読み込みは、<strong>読み取った時点で最新の値</strong>を返すだけで、書き込みまでの間にほかのクライアントが更新するのを防ぎません。<code>put_item</code> に条件がないため、後から書き込んだ側が無条件に上書きします。DynamoDB にはロックを取得する読み取りはなく、競合の検出には条件付き書き込みを使います。` },
      { correct: false, html: `<pre><code>item = table.get_item(Key={"userId": uid},
                      ConsistentRead=True)["Item"]
current = item["version"]
new_cart = apply_change(item["cart"], change)
for attempt in range(3):
    try:
        table.update_item(
            Key={"userId": uid},
            UpdateExpression="SET cart = :c, version = :next",
            ConditionExpression="version = :cur",
            ExpressionAttributeValues={
                ":c": new_cart, ":cur": current, ":next": current + 1},
        )
        return new_cart
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        time.sleep(0.1 * 2 ** attempt)</code></pre>`,
        why: `条件式は正しいものの、<strong>再試行のときに項目を読み直していません</strong>。競合が起きた時点で、テーブルの <code>version</code> は <code>current</code> より大きくなっているため、同じ <code>:cur</code> で何度再試行しても必ず失敗します。また、最新のカートで計算し直すという要件も満たしていません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>楽観的ロック</strong>: 項目にバージョン番号を持たせ、「読み取ったときのバージョンと同じなら書き込み、バージョンを増やす」という条件付き書き込みで、同時更新を検出する。競合したら、最新の値を読み直して処理をやり直す。</li>
  <li>条件を満たさない書き込みは <code>ConditionalCheckFailedException</code>（HTTP 400）になり、項目は変更されない。条件付き書き込みの失敗でも書き込みキャパシティは消費される。</li>
  <li>AWS SDK for Java の DynamoDB 拡張クライアントでは <code>@DynamoDbVersionAttribute</code> を付けるだけで、同じ仕組みが自動で使われる。</li>
  <li>単純な数値の加減算だけなら、読み取りなしで <code>SET qty = qty - :n</code> や <code>ADD</code> を使うアトミックカウンターで十分。読み取った値をもとにアプリケーションで計算する場合に楽観的ロックが必要になる。</li>
  <li>複数の項目をまとめて条件付きで更新する場合は、<code>TransactWriteItems</code> を使う。</li>
  </ul>`,
    refs: [
      ["DynamoDB: バージョン番号を使った楽観的ロック", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BestPractices_ImplementingVersionControl.html"],
      ["DynamoDB: 条件式", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html"],
      ["DynamoDB: 項目と属性の操作（条件付き書き込み・アトミックカウンター）", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html"]
    ]
  }
  ]
});
