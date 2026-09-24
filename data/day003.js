/* DVA-C02 模擬試験 Day 003 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "003",
  date: "2026-09-25",
  title: "EventBridge 非同期処理・クロスアカウント AssumeRole・AppConfig・SNS フィルター・再試行設計",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・4 横断） ---------- */
  {
    id: "q1",
    domain: "分野1 開発 / 分野4 トラブルシューティングと最適化",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>ある EC サイトでは、注文サービスが Amazon EventBridge のカスタムイベントバス <code>orders</code> に次のようなイベントを送信している。</p>
  <pre><code>{
  "source": "com.example.orders",
  "detail-type": "OrderPlaced",
  "detail": { "orderId": "o-1001", "amount": 128000, "currency": "JPY" }
}</code></pre>
  <p>開発者は、高額注文の不正チェックを行う Lambda 関数 <code>fraud-check</code>（Python）を、EventBridge ルールのターゲットとして追加する。関数はチェック結果を DynamoDB テーブル <code>FraudChecks</code>（パーティションキー <code>orderId</code>）に登録する。要件は次のとおりである。</p>
  <ul>
  <li><code>OrderPlaced</code> のうち <code>amount</code> が 100,000 を超えるイベントだけを関数に配信する。関数内でのフィルタリングは行わない。</li>
  <li>関数がエラーになった場合は最大 2 回再試行し、それでも失敗したイベントは、<strong>元のイベントと関数のエラー応答の両方</strong>を含む形で Amazon SQS キューに退避する。</li>
  <li>同じ注文のイベントが重複して届いても、チェック結果が二重に登録されない。同じ注文のイベントが同時に処理される場合も考慮する。</li>
  </ul>
  <p>これらの要件をすべて満たすために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `ルールのイベントパターンを次のように設定する。
  <pre><code>{
  "source": ["com.example.orders"],
  "detail-type": ["OrderPlaced"],
  "detail": {
    "amount": [{ "numeric": ["&gt;", 100000] }]
  }
}</code></pre>`,
        why: `EventBridge のイベントパターンは数値範囲のマッチング（<code>numeric</code> 演算子）をサポートしています。<code>source</code> と <code>detail-type</code> で対象イベントを絞り込み、<code>detail.amount</code> が 100,000 を超えるものだけをターゲットに配信できるため、関数内でのフィルタリングは不要です。` },
      { correct: false, html: `ルールのイベントパターンを次のように設定する。
  <pre><code>{
  "source": ["com.example.orders"],
  "detail-type": ["OrderPlaced"],
  "detail": {
    "amount": ["&gt;100000"]
  }
}</code></pre>`,
        why: `配列内の単純な値は<strong>完全一致</strong>として評価されます。この例は「<code>amount</code> が文字列 <code>"&gt;100000"</code> と等しい」という意味になり、数値の <code>128000</code> には一致しません。比較演算には <code>{"numeric": ["&gt;", 100000]}</code> の形式を使う必要があります。` },
      { correct: true, html: `<code>fraud-check</code> 関数の非同期呼び出し設定で最大再試行回数を 2 にし、失敗時の送信先（<code>OnFailure</code> デスティネーション）に SQS キューを指定する。関数の実行ロールには、そのキューへの <code>sqs:SendMessage</code> を許可する。`,
        why: `EventBridge は Lambda 関数を<strong>非同期</strong>で呼び出します。非同期呼び出しのエラーは Lambda 側で再試行され（0〜2 回で設定可能）、再試行後も失敗したイベントは失敗時の送信先に送られます。送信先へのレコードには <code>requestPayload</code>（元のイベント）と <code>responsePayload</code>（<code>errorMessage</code>、<code>errorType</code> などのエラー応答）が含まれるため、要件を満たします。送信は関数の実行ロールの権限で行われます。` },
      { correct: false, html: `EventBridge ルールのターゲットに再試行ポリシー（最大再試行回数 2）とデッドレターキュー（SQS）を設定し、関数がエラーになったイベントがルールの DLQ に送られるようにする。`,
        why: `ルールのターゲットに設定する再試行ポリシーと DLQ は、<strong>ターゲットへの配信</strong>が失敗した場合（権限不足、ターゲットの削除、スロットリングなど）に使われます。Lambda の非同期呼び出しは、イベントがキューに受け付けられた時点で配信成功となるため、その後に関数コードがエラーになっても EventBridge には伝わらず、ルールの DLQ には送られません。` },
      { correct: true, html: `チェック結果を次のように条件付き書き込みで登録する。
  <pre><code>try:
    table.put_item(
        Item={"orderId": detail["orderId"], "result": result},
        ConditionExpression="attribute_not_exists(orderId)"
    )
except ClientError as e:
    if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
        logger.info("duplicate event skipped", extra={"orderId": detail["orderId"]})
    else:
        raise</code></pre>`,
        why: `DynamoDB の条件付き書き込みは、条件の評価と書き込みを 1 つのアトミックな操作として行います。同じ <code>orderId</code> の項目が既にあれば <code>ConditionalCheckFailedException</code> で書き込みが拒否されるため、重複イベントや同時実行があっても結果は 1 件だけ登録されます。重複はエラー扱いにせずスキップし、それ以外の例外は再送出して非同期呼び出しの再試行に任せています。` },
      { correct: false, html: `チェック結果を次のように、存在確認をしてから登録する。
  <pre><code>existing = table.get_item(Key={"orderId": detail["orderId"]}).get("Item")
if existing is None:
    table.put_item(Item={"orderId": detail["orderId"], "result": result})
else:
    logger.info("duplicate event skipped")</code></pre>`,
        why: `<code>GetItem</code> と <code>PutItem</code> が別々の操作なので、同じ注文のイベントを 2 つの実行環境が同時に処理すると、両方が「存在しない」と判断して二重に書き込む競合状態（レースコンディション）が発生します。さらに <code>GetItem</code> は既定で結果整合性の読み込みです。同時実行を考慮するなら条件付き書き込みを使います。` },
      { correct: false, html: `EventBridge ルールで exactly-once（1 回限り）配信を有効にし、同じイベントが関数に重複して配信されないようにする。`,
        why: `EventBridge には exactly-once 配信を有効にする設定はありません（一見できそうで不可能な構成）。EventBridge と Lambda の非同期呼び出しはいずれも「少なくとも 1 回」の配信であり、同じイベントが複数回処理される可能性があるため、関数側を冪等に実装する必要があります。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <p>この問題は「EventBridge によるイベント駆動パターン（分野1）」「Lambda の非同期呼び出しとエラー処理（分野1）」「失敗イベントの調査に必要な情報の保持（分野4）」を横断しています。</p>
  <ul>
  <li><strong>イベントパターンの演算子</strong>: 完全一致（配列の値）、<code>prefix</code>、<code>suffix</code>、<code>anything-but</code>、<code>numeric</code>、<code>exists</code>、<code>wildcard</code> など。値は常に配列で指定する。</li>
  <li><strong>失敗処理はどこで起きるか</strong>: ルールの DLQ は「EventBridge → ターゲット」の配信失敗用。関数コードのエラーは Lambda の非同期呼び出し設定（再試行回数、イベントの最大有効期間、送信先 / DLQ）で扱う。</li>
  <li><strong>送信先 vs DLQ</strong>: 失敗時の送信先は SQS・SNS・Lambda・EventBridge などに送れ、呼び出しのリクエストとレスポンスの詳細を含む。成功時の送信先（<code>OnSuccess</code>）も設定できる。</li>
  <li><strong>冪等性</strong>: 業務上の一意キー（ここでは <code>orderId</code>）で条件付き書き込みを行う。Powertools for AWS Lambda の Idempotency ユーティリティも同じ仕組みで実装されている。</li>
  </ul>`,
    refs: [
      ["EventBridge: イベントパターン", "https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html"],
      ["EventBridge: 比較演算子を使ったイベントパターン", "https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-pattern-operators.html"],
      ["EventBridge: 配信失敗時のデッドレターキュー", "https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html"],
      ["Lambda: 非同期呼び出しのエラー処理", "https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html"],
      ["Lambda: 非同期呼び出しの記録の保持（送信先）", "https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-retain-records.html"],
      ["DynamoDB: 条件式", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html"]
    ]
  },

  /* ---------- Q2: セキュリティ（クロスアカウントのロール引き受け） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ",
    tag: "手順の選択",
    type: "single", pick: 1,
    text: `
  <p>アカウント A（<code>111111111111</code>）の Lambda 関数 <code>report-builder</code> が、アカウント B（<code>222222222222</code>）の DynamoDB テーブル <code>Sales</code> を読み取る必要がある。要件は次のとおりである。</p>
  <ul>
  <li>長期的な認証情報（アクセスキー）を使用しない。</li>
  <li>アカウント B の運用ルールにより、<code>Sales</code> テーブルのリソースベースポリシーは変更しない。</li>
  <li>最小権限の原則に従う。</li>
  </ul>
  <p>実行ロールの作成から関数への割り当て、コードの実装までの正しい手順はどれですか。</p>`,
    options: [
      { correct: true, html: `<ol>
  <li>アカウント B に <code>SalesReadRole</code> を作成する。信頼ポリシーの <code>Principal</code> に <code>arn:aws:iam::111111111111:role/report-builder-exec</code> を指定して <code>sts:AssumeRole</code> を許可し、アクセス許可ポリシーで <code>Sales</code> テーブルへの <code>dynamodb:GetItem</code> と <code>dynamodb:Query</code> だけを許可する。</li>
  <li>アカウント A に、信頼ポリシーで <code>lambda.amazonaws.com</code> を許可した実行ロール <code>report-builder-exec</code> を作成し、<code>AWSLambdaBasicExecutionRole</code> と、<code>SalesReadRole</code> の ARN に対する <code>sts:AssumeRole</code> を許可するポリシーをアタッチする。</li>
  <li><code>report-builder</code> 関数の実行ロールに <code>report-builder-exec</code> を設定する。</li>
  <li>関数コードで <code>sts.assume_role(RoleArn=..., RoleSessionName=...)</code> を呼び出し、返された一時認証情報で DynamoDB クライアントを作成する。</li>
  </ol>`,
        why: `クロスアカウントのロール引き受けでは、<strong>信頼する側（B）の信頼ポリシー</strong>と<strong>引き受ける側（A）のアイデンティティベースポリシー</strong>の両方で許可が必要です。A の実行ロールは Lambda サービスが引き受けるため <code>lambda.amazonaws.com</code> を信頼し、関数コードは STS の <code>AssumeRole</code> で B のロールの一時認証情報を取得します。B のロールには必要なテーブルと操作だけを許可しているため最小権限になります。` },
      { correct: false, html: `<ol>
  <li>アカウント B に <code>SalesReadRole</code> を作成し、信頼ポリシーの <code>Principal</code> に <code>arn:aws:iam::111111111111:role/report-builder-exec</code> を指定して <code>sts:AssumeRole</code> を許可する。アクセス許可ポリシーで <code>Sales</code> テーブルへの読み取りを許可する。</li>
  <li>アカウント A に、信頼ポリシーで <code>lambda.amazonaws.com</code> を許可した実行ロール <code>report-builder-exec</code> を作成し、<code>AWSLambdaBasicExecutionRole</code> だけをアタッチする（B の信頼ポリシーで許可済みのため、A 側で <code>sts:AssumeRole</code> を許可する必要はない）。</li>
  <li>関数に実行ロールを設定し、コードで <code>sts.assume_role</code> を呼び出す。</li>
  </ol>`,
        why: `クロスアカウントのアクセスでは、リソース側（B の信頼ポリシー）だけでなくプリンシパル側（A の実行ロール）のアイデンティティベースポリシーでも <code>sts:AssumeRole</code> が許可されている必要があります。A 側に許可がないため <code>AssumeRole</code> は <code>AccessDenied</code> になります。同一アカウント内とは評価ロジックが異なる点が重要です。` },
      { correct: false, html: `<ol>
  <li>アカウント B に、信頼ポリシーで <code>lambda.amazonaws.com</code> を許可し、<code>Sales</code> テーブルの読み取りを許可したロール <code>SalesReadRole</code> を作成する。</li>
  <li>アカウント A の <code>report-builder</code> 関数の実行ロールに、アカウント B の <code>SalesReadRole</code> の ARN を直接指定する。</li>
  <li>関数コードはデフォルトの認証情報で DynamoDB クライアントを作成する。</li>
  </ol>`,
        why: `Lambda 関数の実行ロールには、関数と同じアカウントの IAM ロールしか指定できません。関数の作成・更新時にはロールを渡す <code>iam:PassRole</code> が必要ですが、別アカウントのロールを渡すことはできないためです（一見できそうで不可能な構成）。別アカウントのリソースにアクセスするには、同一アカウントの実行ロールから別アカウントのロールを引き受けます。` },
      { correct: false, html: `<ol>
  <li>アカウント B に IAM ユーザーを作成し、<code>Sales</code> テーブルの読み取りだけを許可するポリシーをアタッチしてアクセスキーを発行する。</li>
  <li>アカウント A の <code>report-builder</code> 関数の環境変数にアクセスキーを設定し、カスタマー管理の KMS キーで暗号化する。</li>
  <li>関数コードで環境変数から復号したアクセスキーを使って DynamoDB クライアントを作成する。</li>
  </ol>`,
        why: `環境変数を KMS で暗号化しても、IAM ユーザーのアクセスキーは長期的な認証情報であり、「アクセスキーを使用しない」要件に反します。漏えい時のリスクが大きく、ローテーションの運用も必要になります。AWS はワークロードには IAM ロールによる一時認証情報を使うことを推奨しています。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>クロスアカウントの評価ロジック</strong>: 同一アカウントならアイデンティティベースポリシーかリソースベースポリシーのどちらかで許可されればよいが、クロスアカウントでは<strong>両方</strong>で許可が必要。</li>
  <li><strong>実行ロール</strong>: 信頼ポリシーで <code>lambda.amazonaws.com</code> を許可。関数と同じアカウントのロールのみ指定可能。関数に設定するユーザーには <code>iam:PassRole</code> が必要。</li>
  <li><strong>AssumeRole</strong>: 返される一時認証情報（<code>AccessKeyId</code> / <code>SecretAccessKey</code> / <code>SessionToken</code>）には有効期限がある（既定 1 時間）。ロールチェーンの場合は最大 1 時間に制限される。信頼ポリシーに <code>sts:ExternalId</code> 条件を付けると、第三者による「混乱した代理」問題を防げる。</li>
  <li>DynamoDB はリソースベースポリシーによるクロスアカウントアクセスにも対応しているが、本問ではテーブル側を変更できないためロールの引き受けを使う。</li>
  </ul>`,
    refs: [
      ["IAM: クロスアカウントのポリシー評価ロジック", "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic-cross-account.html"],
      ["IAM チュートリアル: IAM ロールを使用した AWS アカウント間のアクセス委任", "https://docs.aws.amazon.com/IAM/latest/UserGuide/tutorial_cross-account-with-roles.html"],
      ["Lambda: 実行ロール", "https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html"],
      ["AWS STS API: AssumeRole", "https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html"]
    ]
  },

  /* ---------- Q3: デプロイ（AWS AppConfig の機能フラグ） ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "最小限の構成作業量",
    type: "single", pick: 1,
    text: `
  <p>ある会社は、Lambda 関数（Node.js）で構成される予約 API に新しい料金計算ロジックを実装し、機能フラグ <code>newPricing</code> で有効/無効を切り替えられるようにした。コードはすでに本番にデプロイ済みで、フラグは現在オフである。チームは次の要件を満たしたい。</p>
  <ul>
  <li>関数のコードや構成を再デプロイせずにフラグをオンにできる。</li>
  <li>フラグの変更は一度に全体に適用せず、段階的に反映する。</li>
  <li>反映中に関数のエラー率の Amazon CloudWatch アラームが ALARM になった場合は、自動的に元の値に戻す。</li>
  <li>フラグ値を取得するための API 呼び出しとレイテンシを抑える。</li>
  </ul>
  <p>最小限の構成作業量でこれらの要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `AWS AppConfig でアプリケーション、環境、機能フラグの設定プロファイルを作成し、環境のモニターにエラー率の CloudWatch アラームを登録する。<code>AppConfig.Linear20PercentEvery6Minutes</code> などの段階的なデプロイ戦略でフラグの変更をデプロイする。Lambda 関数には AWS AppConfig Agent Lambda 拡張機能のレイヤーを追加し、<code>http://localhost:2772</code> からフラグを取得する。`,
        why: `AppConfig は設定をコードと分離して安全にデプロイするサービスで、機能フラグ用の設定プロファイル、段階的なデプロイ戦略、CloudWatch アラームと連動した自動ロールバックを標準で備えています。AppConfig Agent Lambda 拡張機能は設定をバックグラウンドでポーリングしてローカルにキャッシュするため、関数はローカル HTTP エンドポイントから取得するだけで済み、API 呼び出しとレイテンシを抑えられます。` },
      { correct: false, html: `フラグを AWS Systems Manager Parameter Store の <code>String</code> パラメータとして保存し、関数コードで呼び出しごとに <code>GetParameter</code> を実行して値を読み取る。問題があれば運用担当者がパラメータを手動で元に戻す。`,
        why: `再デプロイなしの切り替えはできますが、Parameter Store には値の段階的な反映やアラームと連動した自動ロールバックの機能がありません。呼び出しごとの <code>GetParameter</code> は API 呼び出しとレイテンシを増やし、スロットリングの原因にもなります。` },
      { correct: false, html: `関数の環境変数 <code>NEW_PRICING=true</code> を <code>update-function-configuration</code> で設定する。問題があれば同じコマンドで <code>false</code> に戻す。`,
        why: `環境変数の変更は関数の構成の更新であり、「構成を再デプロイしない」要件に反します。更新は全体に一度に反映され（段階的な反映の仕組みがない）、アラームと連動した自動ロールバックもありません。` },
      { correct: false, html: `フラグ値をコード内の定数として <code>true</code> に変更し、AWS SAM の <code>DeploymentPreference</code>（<code>Linear10PercentEvery1Minute</code>）と CloudWatch アラームを使って CodeDeploy で段階的にデプロイする。`,
        why: `段階的な反映と自動ロールバックは実現できますが、フラグを変えるたびにコードを変更して新しいバージョンを発行・デプロイする必要があり、「コードを再デプロイせずに切り替える」という機能フラグの目的と要件に反します。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>AWS AppConfig の構成要素</strong>: アプリケーション → 環境（モニターとして CloudWatch アラームを登録）→ 設定プロファイル（機能フラグ / 自由形式、バリデーター）→ デプロイ戦略（Linear / Exponential、デプロイ時間、ベイク時間）。</li>
  <li><strong>定義済みデプロイ戦略の例</strong>: <code>AppConfig.AllAtOnce</code>、<code>AppConfig.Linear50PercentEvery30Seconds</code>、<code>AppConfig.Canary10Percent20Minutes</code>、<code>AppConfig.Linear20PercentEvery6Minutes</code>。</li>
  <li><strong>自動ロールバック</strong>: デプロイ中またはベイク時間中にモニターのアラームが発生すると、AppConfig が以前の設定に戻す。</li>
  <li><strong>取得方法</strong>: Lambda では AppConfig Agent Lambda 拡張機能（ポート 2772）を使うのが推奨。SDK で直接取得する場合は <code>StartConfigurationSession</code> と <code>GetLatestConfiguration</code> を使う（旧 <code>GetConfiguration</code> API は非推奨）。</li>
  </ul>`,
    refs: [
      ["AWS AppConfig とは", "https://docs.aws.amazon.com/appconfig/latest/userguide/what-is-appconfig.html"],
      ["AWS AppConfig: デプロイ戦略", "https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-deployment-strategy.html"],
      ["AWS AppConfig: Lambda 拡張機能との統合", "https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-integration-lambda-extensions.html"]
    ]
  },

  /* ---------- Q4: 最適化（SNS サブスクリプションフィルターポリシー） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化",
    tag: "設定の選択",
    type: "multi", pick: 2,
    text: `
  <p>注文サービスは、Amazon SNS 標準トピック <code>order-events</code> に注文メッセージを発行している。メッセージにはメッセージ属性 <code>orderType</code>（<code>String</code> 型、値は <code>standard</code> または <code>premium</code>）が設定され、本文は次の JSON である。</p>
  <pre><code>{ "order": { "orderId": "o-2001", "amount": 150000, "region": "JP" } }</code></pre>
  <p>トピックには 3 つの SQS キューがサブスクライブしている。現在は全メッセージが全キューに配信され、各コンシューマーが不要なメッセージを読み捨てているため、無駄な処理とコストが発生している。</p>
  <ul>
  <li><code>shipping-queue</code>: すべての注文を受信する。</li>
  <li><code>premium-queue</code>: <code>orderType</code> が <code>premium</code> の注文だけを受信する。</li>
  <li><code>audit-queue</code>: 本文の <code>amount</code> が 100,000 以上の注文だけを受信する。</li>
  </ul>
  <p>パブリッシャーのコードを変更せずに、SNS 側で不要な配信を止めるために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `<code>premium-queue</code> のサブスクリプションに、フィルターポリシー <code>{"orderType": ["premium"]}</code> を設定する（フィルターポリシーのスコープは既定の <code>MessageAttributes</code>）。`,
        why: `フィルターポリシーは<strong>サブスクリプション</strong>ごとに設定し、条件に一致したメッセージだけがそのサブスクライバーに配信されます。既定のスコープ <code>MessageAttributes</code> ではメッセージ属性を評価するため、<code>orderType</code> が <code>premium</code> のメッセージだけが <code>premium-queue</code> に届きます。` },
      { correct: true, html: `<code>audit-queue</code> のサブスクリプションで <code>FilterPolicyScope</code> を <code>MessageBody</code> に設定し、フィルターポリシー <code>{"order": {"amount": [{"numeric": ["&gt;=", 100000]}]}}</code> を設定する。`,
        why: `スコープを <code>MessageBody</code> にすると、JSON 形式のメッセージ本文に対してフィルタリングでき、ネストしたプロパティも指定できます。<code>amount</code> は本文にしかないため、パブリッシャーを変更せずにフィルタリングするには本文ベースのフィルタリングを使います。数値の範囲条件には <code>numeric</code> 演算子を使います。` },
      { correct: false, html: `トピック <code>order-events</code> の属性 <code>FilterPolicy</code> に条件を設定し、各キューへの配信をトピック側でまとめて制御する。`,
        why: `<code>FilterPolicy</code> はサブスクリプションの属性であり、トピックに設定する属性ではありません。サブスクライバーごとに受信したいメッセージが異なるため、各サブスクリプションにフィルターポリシーを設定します。` },
      { correct: false, html: `<code>audit-queue</code> のサブスクリプションに、スコープを既定の <code>MessageAttributes</code> のまま、フィルターポリシー <code>{"amount": [{"numeric": ["&gt;=", 100000]}]}</code> を設定する。`,
        why: `スコープが <code>MessageAttributes</code> の場合、ポリシーはメッセージ属性に対して評価されます。<code>amount</code> はメッセージ属性ではなく本文にあるため、属性が存在しないメッセージはポリシーに一致せず、<code>audit-queue</code> には 1 件も配信されなくなります。` },
      { correct: false, html: `<code>premium-queue</code> と <code>audit-queue</code> のキューポリシーに、SNS のメッセージ属性や本文の値を条件とする <code>Condition</code> を追加し、条件に一致しないメッセージの受信を拒否する。`,
        why: `SQS のキューポリシー（リソースベースポリシー）は「どのプリンシパル・送信元がキューにアクセスできるか」を制御するもので、メッセージの属性や本文の内容を条件にする条件キーはありません（一見できそうで不可能な構成）。内容によるフィルタリングは SNS のサブスクリプションフィルターポリシーで行います。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>フィルターポリシーはサブスクリプション単位</strong>。フィルターポリシーがないサブスクリプション（ここでは <code>shipping-queue</code>）はすべてのメッセージを受信する。</li>
  <li><strong>スコープ</strong>: <code>MessageAttributes</code>（既定）はメッセージ属性、<code>MessageBody</code> は JSON 本文を評価する。本文ベースならネストしたキーも指定できる。</li>
  <li><strong>演算子</strong>: 完全一致、<code>anything-but</code>、<code>prefix</code>、<code>suffix</code>、<code>numeric</code>（範囲）、<code>exists</code>、IP アドレス照合など。キー間は AND、配列内の値は OR。</li>
  <li>SNS でフィルタリングすると、不要なメッセージがキューに入らず、SQS のリクエスト数・コンシューマーの処理量・コストをまとめて削減できる。</li>
  </ul>`,
    refs: [
      ["Amazon SNS: メッセージフィルタリング", "https://docs.aws.amazon.com/sns/latest/dg/sns-message-filtering.html"],
      ["Amazon SNS: サブスクリプションフィルターポリシー", "https://docs.aws.amazon.com/sns/latest/dg/sns-subscription-filter-policies.html"],
      ["Amazon SQS: キューポリシーの使用", "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-using-identity-based-policies.html"]
    ]
  },

  /* ---------- Q5: 開発（外部サービス呼び出しの再試行とバックオフ） ---------- */
  {
    id: "q5",
    domain: "分野1 開発",
    tag: "疑似コード",
    type: "single", pick: 1,
    text: `
  <p>Lambda 関数（Python、タイムアウト 30 秒）が、サードパーティの配送業者 API を HTTP で呼び出している。関数は同時に数百件実行されることがある。配送業者 API には次の特徴がある。</p>
  <ul>
  <li>混雑時には HTTP 429 や 503 を返す。まれに応答を返さずに接続がハングする。</li>
  <li>リクエストの内容に誤りがある場合は HTTP 400 を返す。</li>
  </ul>
  <p>開発者は、次の要件を満たす再試行処理を実装したい。</p>
  <ul>
  <li>一時的なエラー（429、5xx、接続エラー、タイムアウト）だけを再試行する。</li>
  <li>多数の実行環境からの再試行が同じタイミングに集中しないようにする。</li>
  <li>関数のタイムアウト内に、最終的な失敗を例外として呼び出し元に返す。</li>
  </ul>
  <p>これらの要件を満たす実装はどれですか。（<code>requests</code> ライブラリを使用）</p>`,
    options: [
      { correct: true, html: `<pre><code>RETRYABLE = {429, 500, 502, 503, 504}

def call_carrier(payload, max_attempts=4, base=0.2, cap=3.0):
    for attempt in range(max_attempts):
        try:
            r = requests.post(URL, json=payload, timeout=(2, 5))
            if r.status_code not in RETRYABLE:
                r.raise_for_status()   # 400 などは再試行せず即座に例外
                return r.json()
        except (requests.ConnectionError, requests.Timeout):
            pass                       # 一時的な障害は再試行する
        if attempt &lt; max_attempts - 1:
            # 指数バックオフ + フルジッター
            time.sleep(random.uniform(0, min(cap, base * 2 ** attempt)))
    raise CarrierUnavailable("retries exhausted")</code></pre>`,
        why: `再試行対象を 429・5xx・接続エラー・タイムアウトに限定し、400 などのクライアントエラーは <code>raise_for_status()</code> で即座に失敗させています。待機時間は指数的に増加する上限値（<code>cap</code> で頭打ち）の範囲からランダムに選ぶ「フルジッター」なので、多数の実行環境の再試行が分散されます。<code>timeout=(接続, 読み取り)</code> でハングを防ぎ、最大の所要時間は約 4 回 × 7 秒 + 待機 約 1.4 秒で関数のタイムアウト（30 秒）に収まり、最後は例外を送出します。` },
      { correct: false, html: `<pre><code>def call_carrier(payload):
    while True:
        try:
            r = requests.post(URL, json=payload, timeout=(2, 5))
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            time.sleep(1)   # 1 秒待って再試行</code></pre>`,
        why: `<code>RequestException</code> はすべての HTTP エラーを含むため、400 のような再試行しても成功しないエラーまで再試行します。回数の上限がなく、関数がタイムアウトするまでループし続けるため、呼び出し元に意味のある例外を返せません。また固定の 1 秒間隔では、多数の実行環境からの再試行が同じタイミングに集中します。` },
      { correct: false, html: `<pre><code>def call_carrier(payload, max_attempts=4, base=0.2):
    for attempt in range(max_attempts):
        r = requests.post(URL, json=payload, timeout=(2, 5))
        if r.status_code &lt; 400:
            return r.json()
        time.sleep(base * 2 ** attempt)   # 0.2, 0.4, 0.8, 1.6 秒
    return None</code></pre>`,
        why: `400 以上のすべてのステータスを再試行するため、400 のようなクライアントエラーも再試行します。待機時間にジッターがないので、同時に失敗した多数の実行環境が同じタイミングで再試行します（Thundering Herd）。さらに接続エラーやタイムアウトの例外を捕捉していないため再試行されず、全試行が失敗しても <code>None</code> を返すだけで、失敗が呼び出し元に例外として伝わりません。` },
      { correct: false, html: `<pre><code>RETRYABLE = {429, 500, 502, 503, 504}

def call_carrier(payload, max_attempts=4, base=0.2, cap=3.0):
    for attempt in range(max_attempts):
        try:
            r = requests.post(URL, json=payload)
            if r.status_code not in RETRYABLE:
                r.raise_for_status()
                return r.json()
        except requests.ConnectionError:
            pass
        if attempt &lt; max_attempts - 1:
            time.sleep(random.uniform(0, min(cap, base * 2 ** attempt)))
    raise CarrierUnavailable("retries exhausted")</code></pre>`,
        why: `再試行対象とジッター付きバックオフは正しいものの、<code>requests</code> はタイムアウトを指定しないと<strong>無期限に応答を待ちます</strong>。配送業者 API の接続がハングすると 1 回目の呼び出しから戻らず、再試行も例外の送出もできないまま関数自体が 30 秒でタイムアウトします。外部呼び出しには必ずタイムアウトを設定します。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>再試行してよいエラーを選ぶ</strong>: スロットリング（429）、サーバーエラー（5xx）、ネットワーク障害は一時的なので再試行する。400/401/403 などは何度送っても失敗するので再試行しない。</li>
  <li><strong>指数バックオフ + ジッター</strong>: 待機時間を指数的に伸ばし、上限（cap）を設け、ランダム化して再試行を分散させる。AWS SDK の再試行モード（<code>standard</code> / <code>adaptive</code>）も同じ考え方で実装されている。</li>
  <li><strong>タイムアウトの予算</strong>: 各呼び出しのタイムアウト × 試行回数 + 待機時間が、Lambda 関数のタイムアウトや呼び出し元のタイムアウト（API Gateway の統合タイムアウトなど）に収まるように設計する。</li>
  <li><strong>冪等性</strong>: 再試行で同じリクエストが複数回届く可能性があるため、外部 API 側がサポートしていれば冪等キーを付ける。</li>
  <li>障害が長引く場合は、失敗が続いたら一定時間呼び出しを止める<strong>サーキットブレーカー</strong>パターンを組み合わせ、外部サービスへの負荷と無駄な待機を避ける。</li>
  </ul>`,
    refs: [
      ["AWS SDK とツール: 再試行の動作", "https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html"],
      ["AWS 規範ガイダンス: バックオフパターンによる再試行", "https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html"],
      ["AWS 規範ガイダンス: サーキットブレーカーパターン", "https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html"],
      ["Amazon Builders' Library: タイムアウト、再試行、ジッターを伴うバックオフ", "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/"]
    ]
  }
  ]
});
