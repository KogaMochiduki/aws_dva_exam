/* DVA-C02 模擬試験 Day 005 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "005",
  date: "2026-09-27",
  title: "Step Functions のエラー処理とコールバック・クロスアカウント KMS・Beanstalk トラフィック分割・同時実行・DynamoDB Query",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・2 横断） ---------- */
  {
    id: "q1",
    domain: "分野1 開発 / 分野2 セキュリティ",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>ある EC サイトは、注文処理を AWS Step Functions の Standard ワークフローでオーケストレーションしている。処理の流れは次のとおりである。</p>
  <ol>
  <li><code>ReserveInventory</code>（Lambda）: 在庫を引き当てる</li>
  <li><code>ChargePayment</code>（Lambda）: 外部の決済 API で決済する</li>
  <li>金額が 50 万円以上の注文は、担当者の承認を待つ</li>
  <li><code>ShipOrder</code>（Lambda）: 出荷を指示する</li>
  </ol>
  <p><code>ChargePayment</code> 関数（Python）は、決済 API がタイムアウトした場合は <code>PaymentTimeoutError</code>、カードが拒否された場合は <code>CardDeclinedError</code> という独自の例外を送出する。要件は次のとおりである。</p>
  <ul>
  <li><code>PaymentTimeoutError</code> は間隔を広げながら最大 3 回再試行する。<code>CardDeclinedError</code> は再試行しない。</li>
  <li>決済が最終的に失敗した場合は、補償処理 <code>ReleaseInventory</code> で在庫の引き当てを取り消す。<code>ReleaseInventory</code> には<strong>元の注文データとエラー情報の両方</strong>を渡す。</li>
  <li>承認はメールで依頼し、担当者が社内の承認画面でボタンを押すと、API Gateway 経由で Lambda 関数 <code>ApproveHandler</code> が呼び出される。承認を待つ間、ワークフローはポーリングを行わない。承認は最大 24 時間待つ。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `<code>ChargePayment</code> ステートを次のように定義する。
  <pre><code>"ChargePayment": {
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke",
  "Parameters": { "FunctionName": "ChargePayment", "Payload.$": "$" },
  "Retry": [{
    "ErrorEquals": ["PaymentTimeoutError"],
    "IntervalSeconds": 2,
    "BackoffRate": 2.0,
    "MaxAttempts": 3
  }],
  "Catch": [{
    "ErrorEquals": ["States.ALL"],
    "ResultPath": "$.error",
    "Next": "ReleaseInventory"
  }],
  "Next": "CheckAmount"
}</code></pre>`,
        why: `Lambda 関数が例外を送出すると、例外のクラス名（<code>errorType</code>）がエラー名として Step Functions に渡され、<code>ErrorEquals</code> で照合できます。<code>Retry</code> は <code>PaymentTimeoutError</code> だけを対象に、2 秒・4 秒・8 秒と間隔を広げて最大 3 回再試行します。<code>CardDeclinedError</code> や再試行を使い切ったエラーは <code>Catch</code> で捕捉されます。<code>"ResultPath": "$.error"</code> を指定しているので、元の入力にエラー情報が <code>error</code> として追加された状態で <code>ReleaseInventory</code> に渡されます。` },
      { correct: false, html: `<code>ChargePayment</code> ステートの <code>Retry</code> を次のように定義し、<code>Catch</code> は正解の定義と同じにする。
  <pre><code>"Retry": [{
  "ErrorEquals": ["States.ALL"],
  "IntervalSeconds": 2,
  "BackoffRate": 2.0,
  "MaxAttempts": 3
}]</code></pre>`,
        why: `<code>States.ALL</code> はすべてのエラーに一致するため、<code>CardDeclinedError</code> も 3 回再試行されます。カードの拒否は何度試しても結果が変わらない恒久的なエラーで、決済 API に無駄なリクエストを送ることになります。「<code>CardDeclinedError</code> は再試行しない」という要件に反します。` },
      { correct: false, html: `<code>ChargePayment</code> ステートの <code>Catch</code> を次のように定義し、<code>Retry</code> は正解の定義と同じにする。
  <pre><code>"Catch": [{
  "ErrorEquals": ["States.ALL"],
  "Next": "ReleaseInventory"
}]</code></pre>`,
        why: `<code>Catch</code> で <code>ResultPath</code> を省略すると、既定値の <code>"$"</code> が使われ、ステートの入力全体がエラー情報（<code>Error</code> と <code>Cause</code>）で<strong>置き換えられます</strong>。<code>ReleaseInventory</code> には元の注文データが渡らないため、どの注文の在庫を取り消せばよいかわかりません。` },
      { correct: true, html: `承認待ちのステートを次のように定義する。
  <pre><code>"WaitForApproval": {
  "Type": "Task",
  "Resource": "arn:aws:states:::sns:publish.waitForTaskToken",
  "Parameters": {
    "TopicArn": "arn:aws:sns:ap-northeast-1:111122223333:approval",
    "Message": {
      "orderId.$": "$.orderId",
      "taskToken.$": "$$.Task.Token"
    }
  },
  "TimeoutSeconds": 86400,
  "Next": "ShipOrder"
}</code></pre>
  <code>ApproveHandler</code> 関数では、承認画面から受け取ったタスクトークンを使って <code>SendTaskSuccess</code>（却下の場合は <code>SendTaskFailure</code>）を呼び出す。`,
        why: `<code>.waitForTaskToken</code> を付けたサービス統合（コールバックパターン）では、Step Functions はタスクトークンを渡してタスクを開始し、トークンが返されるまで<strong>ポーリングせずに</strong>一時停止します。コンテキストオブジェクトの <code>$$.Task.Token</code> でトークンを取得してメッセージに含め、承認時に <code>SendTaskSuccess</code> を呼ぶと、その出力で次のステートに進みます。<code>TimeoutSeconds</code> を指定しておけば、24 時間以内に応答がない場合は <code>States.Timeout</code> で失敗させられます。` },
      { correct: false, html: `承認待ちの処理だけを Express ワークフローとして切り出し、その中で <code>.waitForTaskToken</code> を使って承認を待つ。料金を抑えるため、親の Standard ワークフローから Express ワークフローを呼び出す。`,
        why: `Express ワークフローは <strong>コールバック（<code>.waitForTaskToken</code>）とジョブの実行（<code>.sync</code>）の統合パターンをサポートしていません</strong>（一見できそうで不可能な構成）。また、Express ワークフローの最大実行時間は 5 分なので、24 時間の承認待ちには使えません。人による承認のような長時間の待機は Standard ワークフローで行います。` },
      { correct: false, html: `承認待ちを <code>Wait</code> ステート（5 分）と、DynamoDB の承認フラグを確認する Lambda 関数、<code>Choice</code> ステートのループで実装する。<code>ApproveHandler</code> 関数は DynamoDB の承認フラグを更新する。`,
        why: `動作はしますが、5 分ごとに Lambda 関数で状態を確認する<strong>ポーリング</strong>になっており、「ポーリングを行わない」という要件に反します。承認されるまで状態遷移と Lambda の呼び出しが続くため、Standard ワークフローの料金（状態遷移の回数で課金）も増えます。` },
      { correct: true, html: `<code>ApproveHandler</code> 関数の実行ロールに、<code>states:SendTaskSuccess</code> と <code>states:SendTaskFailure</code> を許可するポリシーを追加する。ステートマシンの実行ロールには、4 つの Lambda 関数の <code>lambda:InvokeFunction</code> と、承認用トピックへの <code>sns:Publish</code> を許可する。`,
        why: `タスクトークンを返すのは <code>ApproveHandler</code> 関数なので、<code>SendTaskSuccess</code> / <code>SendTaskFailure</code> の権限はその関数の実行ロールに必要です。一方、ステートマシンが Lambda 関数を呼び出したり SNS に発行したりするときは、ステートマシンの実行ロールの権限が使われます。サービス間の呼び出しでは、「どのプリンシパルが API を呼ぶのか」を考えて、それぞれのロールに必要な最小限の権限を付けます。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <p>この問題は「オーケストレーションと耐障害性のあるアプリケーション（分野1）」と「サービス間の認証と IAM のアクセス許可（分野2）」を横断しています。</p>
  <ul>
  <li><strong>Retry と Catch</strong>: <code>Retry</code> は上から順に評価され、<code>IntervalSeconds</code>、<code>BackoffRate</code>、<code>MaxAttempts</code>（さらに <code>MaxDelaySeconds</code>、<code>JitterStrategy</code>）で指数バックオフを設定できる。再試行を使い切るか、再試行対象でないエラーは <code>Catch</code> に進む。</li>
  <li><strong>ResultPath</strong>: 省略すると <code>"$"</code>（入力を結果で置き換える）。<code>"$.error"</code> のように指定すると入力を残したまま結果を追加でき、<code>null</code> にすると結果を捨てて入力をそのまま出力する。</li>
  <li><strong>コールバックパターン</strong>: <code>.waitForTaskToken</code> と <code>$$.Task.Token</code> を使い、外部の処理（人による承認など）が <code>SendTaskSuccess</code> / <code>SendTaskFailure</code> を呼ぶまで待つ。長時間の待機には <code>TimeoutSeconds</code> や <code>HeartbeatSeconds</code> を設定する。</li>
  <li><strong>Standard と Express</strong>: Standard は最大 1 年・exactly-once で、決済のような冪等でない処理や長時間の待機に向く。Express は最大 5 分・大量のイベント処理向けで、<code>.sync</code> と <code>.waitForTaskToken</code> は使えない。</li>
  <li><strong>Saga パターン</strong>: 分散したトランザクションを、処理ごとの補償処理（ここでは <code>ReleaseInventory</code>）で取り消す。</li>
  </ul>`,
    refs: [
      ["Step Functions: ワークフローでのエラー処理", "https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html"],
      ["Step Functions: ResultPath による出力の指定", "https://docs.aws.amazon.com/step-functions/latest/dg/input-output-resultpath.html"],
      ["Step Functions: タスクトークンによるコールバックの待機", "https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html#connect-wait-token"],
      ["Step Functions: ワークフロータイプの選択", "https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html"]
    ]
  },

  /* ---------- Q2: セキュリティ（クロスアカウントの KMS とキーローテーション） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ",
    tag: "設定の選択",
    type: "multi", pick: 2,
    text: `
  <p>アカウント A（111122223333）の Amazon S3 バケット <code>shared-reports</code> には、アカウント A のカスタマーマネージドキー（AWS KMS）による SSE-KMS で暗号化されたレポートが保存されている。</p>
  <p>アカウント B（444455556666）の Lambda 関数（実行ロール <code>report-reader</code>）から、このバケットのレポートを読み取る必要がある。また、セキュリティ部門はこのキーについて、1 年ごとの自動キーローテーションを有効にするよう求めている。既存のレポートは、ローテーション後も読み取れなければならない。</p>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `アカウント A で、キーポリシーに <code>report-reader</code> ロールへの <code>kms:Decrypt</code> を許可するステートメントを追加し、バケットポリシーでそのロールに <code>s3:GetObject</code> を許可する。アカウント B では、<code>report-reader</code> ロールの IAM ポリシーで、バケットのオブジェクトへの <code>s3:GetObject</code> と、アカウント A のキー ARN への <code>kms:Decrypt</code> を許可する。`,
        why: `アカウントをまたぐアクセスでは、<strong>リソース側（アカウント A）とプリンシパル側（アカウント B）の両方</strong>で許可が必要です。SSE-KMS で暗号化されたオブジェクトを読むには、S3 の <code>s3:GetObject</code> に加えて、S3 がキーでデータキーを復号するための <code>kms:Decrypt</code> も必要です。KMS キーのアクセスはキーポリシーが起点になるため、別アカウントからの利用はキーポリシーで許可しなければなりません。IAM ポリシーではエイリアスではなくキー ARN を指定します。` },
      { correct: false, html: `アカウント B の <code>report-reader</code> ロールの IAM ポリシーで、アカウント A のバケットへの <code>s3:GetObject</code> とキーへの <code>kms:Decrypt</code> を許可する。IAM ポリシーでリソースの ARN を指定していれば、アカウント A 側の変更は不要である。`,
        why: `IAM ポリシーは自分のアカウントのプリンシパルに権限を与えるだけで、別のアカウントのリソースへのアクセスを一方的に許可することはできません。アカウント A のキーポリシーとバケットポリシーでアカウント B のロール（またはアカウント）を許可していないため、<code>AccessDenied</code> になります。` },
      { correct: false, html: `カスタマーマネージドキーの代わりに AWS マネージドキー <code>aws/s3</code> でオブジェクトを暗号化し直し、<code>aws/s3</code> のキーポリシーを編集してアカウント B のロールに <code>kms:Decrypt</code> を許可する。`,
        why: `AWS マネージドキーの<strong>キーポリシーは変更できません</strong>（一見できそうで不可能な構成）。<code>aws/s3</code> のキーポリシーは、同じアカウント内で S3 を経由した利用だけを許可しているため、別のアカウントのプリンシパルに復号させることはできません。クロスアカウントで使うにはカスタマーマネージドキーが必要です。` },
      { correct: true, html: `カスタマーマネージドキーの自動キーローテーションを有効にし、ローテーション期間を 365 日にする。既存のオブジェクトの再暗号化や、キーポリシー・IAM ポリシーのキー ARN の変更は行わない。`,
        why: `自動ローテーションでは、同じ KMS キーに新しいキーマテリアルが追加されるだけで、キー ID と ARN は変わりません。以前のキーマテリアルは KMS に保持され、それで暗号化されたデータは自動的に復号されるため、既存のオブジェクトの再暗号化もポリシーの変更も不要です。ローテーション期間は 90〜2,560 日の範囲で指定できます（既定は 365 日）。` },
      { correct: false, html: `自動キーローテーションを有効にする。ローテーション後は古いキーマテリアルが削除されるため、ローテーションの前に S3 バッチオペレーションで既存のオブジェクトを新しいキーマテリアルで再暗号化するジョブを作成する。`,
        why: `KMS はローテーション後も以前のキーマテリアルを<strong>すべて保持します</strong>。KMS キーを削除しない限り、古いキーマテリアルで暗号化されたデータも復号できます。再暗号化は不要で、手間とコストが増えるだけです。` },
      { correct: false, html: `自動キーローテーションを有効にする。ローテーションのたびに新しいキー ARN が発行されるため、エイリアスを新しいキーに付け替える Lambda 関数を作成し、キーポリシーとバケットポリシーも更新する。`,
        why: `自動ローテーションでは<strong>キー ARN は変わりません</strong>。エイリアスの付け替えが必要なのは、新しい KMS キーを作って切り替える「手動ローテーション」の場合です（自動ローテーションに対応していない非対称キー、HMAC キー、カスタムキーストアのキーなど）。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>クロスアカウントの評価</strong>: 別アカウントのリソースにアクセスするには、リソースベースのポリシー（キーポリシー、バケットポリシー）とプリンシパル側の IAM ポリシーの<strong>両方</strong>で許可されている必要がある。</li>
  <li><strong>SSE-KMS の読み取り</strong>: <code>s3:GetObject</code> と <code>kms:Decrypt</code> が必要。書き込みでは <code>kms:GenerateDataKey</code> が必要。</li>
  <li><strong>AWS マネージドキー</strong>: キーポリシーの変更やローテーション設定の変更はできず、クロスアカウントでも使えない。細かく制御したいならカスタマーマネージドキーを使う。</li>
  <li><strong>自動ローテーション</strong>: キー ID / ARN は変わらず、古いキーマテリアルも保持される。ローテーション期間は 90〜2,560 日で設定でき、<code>RotateKeyOnDemand</code> ですぐにローテーションすることもできる。</li>
  </ul>`,
    refs: [
      ["AWS KMS: 他のアカウントのユーザーに KMS キーの使用を許可する", "https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-modifying-external-accounts.html"],
      ["AWS KMS: キーのローテーション", "https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html"],
      ["Amazon S3: SSE-KMS によるサーバー側の暗号化", "https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html"],
      ["IAM: クロスアカウントのポリシー評価ロジック", "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic-cross-account.html"]
    ]
  },

  /* ---------- Q3: デプロイ（Elastic Beanstalk のデプロイポリシー） ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "デプロイ戦略の選択",
    type: "single", pick: 1,
    text: `
  <p>ある Web アプリケーションは、Application Load Balancer を使う AWS Elastic Beanstalk の環境（EC2 インスタンス 8 台）で稼働している。開発者は新しいバージョンのリリースで、次の要件を満たすデプロイポリシーを選ぶ必要がある。</p>
  <ul>
  <li>まず受信トラフィックの 10% だけを新しいバージョンに送り、15 分間正常に動作することを確認してから、残りのトラフィックを切り替える。</li>
  <li>新しいバージョンがヘルスチェックに合格しない場合は、自動的にすべてのトラフィックを元のバージョンに戻す。</li>
  <li>デプロイ中も処理能力（インスタンス数）を落とさない。環境の URL（CNAME）は変更しない。</li>
  </ul>
  <p>最小限の構成作業量でこの要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `デプロイポリシーを<strong>トラフィック分割</strong>（<code>TrafficSplitting</code>）にし、<code>aws:elasticbeanstalk:trafficsplitting</code> 名前空間で <code>NewVersionPercent</code> を 10、<code>EvaluationTime</code> を 15 に設定する。`,
        why: `トラフィック分割では、新しいバージョンのインスタンスを一時的な Auto Scaling グループに元と同じ台数だけ起動し、指定した割合のトラフィックを評価時間の間だけ送ります。正常なら残りのトラフィックも切り替えて古いインスタンスを終了し、ヘルスチェックに合格しなければトラフィックを元に戻して新しいインスタンスを終了します。容量は落ちず、URL も変わりません。Application Load Balancer が必要ですが、この環境は条件を満たしています。` },
      { correct: false, html: `デプロイポリシーを<strong>イミュータブル</strong>（<code>Immutable</code>）にする。`,
        why: `イミュータブルでも新しいインスタンス群を別の Auto Scaling グループに起動し、ヘルスチェックに失敗すればそれを終了するので、容量の維持と安全なロールバックはできます。しかし、<strong>トラフィックの一部だけを一定時間送って評価する</strong>仕組みはないため、カナリアテストの要件を満たせません。` },
      { correct: false, html: `デプロイポリシーを<strong>追加バッチによるローリング</strong>（<code>RollingWithAdditionalBatch</code>）にし、バッチサイズを 10% にする。`,
        why: `追加のバッチを先に起動するので容量は保たれますが、バッチごとに順番にデプロイするだけで、トラフィックの割合を制御して評価することはできません。途中のバッチで失敗すると新旧のバージョンが混在したまま止まり、元に戻すには以前のバージョンを再デプロイする必要があります。自動でトラフィックを戻す要件を満たせません。` },
      { correct: false, html: `現在の環境を複製して新しいバージョンをデプロイし、動作を確認したら「環境 URL のスワップ」で切り替える（ブルー/グリーンデプロイ）。`,
        why: `ブルー/グリーンデプロイは 2 つの環境の CNAME を入れ替えて切り替える方法です。環境の複製や切り替え・切り戻しを手動で行う必要があり、作業量が多くなります。また、CNAME の入れ替えなので、トラフィックの 10% だけを送るといった段階的な切り替えや、ヘルスチェックに基づく自動ロールバックはできません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <table style="border-collapse:collapse;margin:8px 0;font-size:.95em">
  <tr><th style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">ポリシー</th><th style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">容量</th><th style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">失敗時</th><th style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">特徴</th></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">一度に全部</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">一時的に停止</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">再デプロイが必要</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">最速だがダウンタイムあり</td></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">ローリング</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">バッチ分減る</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">再デプロイが必要（新旧混在）</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">追加コストなし</td></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">追加バッチによるローリング</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">維持</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">再デプロイが必要（新旧混在）</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">追加バッチ分のコスト</td></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">イミュータブル</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">維持</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">新インスタンスを終了するだけ</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">新旧が混在しない</td></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">トラフィック分割</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">維持</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">トラフィックを戻して新インスタンスを終了</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">カナリアテスト（ALB が必要）</td></tr>
  </table>
  <ul>
  <li>ブルー/グリーンはデプロイポリシーではなく、別の環境を用意して URL をスワップ（または Route 53 で切り替え）する運用。データベースを環境の外に置くなどの設計が前提になる。</li>
  </ul>`,
    refs: [
      ["Elastic Beanstalk: デプロイポリシーと設定", "https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/using-features.rolling-version-deploy.html"],
      ["Elastic Beanstalk: ブルー/グリーンデプロイ", "https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/using-features.CNAMESwap.html"]
    ]
  },

  /* ---------- Q4: トラブルシューティング（同時実行とスロットリング） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化",
    tag: "メトリクスの解釈",
    type: "multi", pick: 2,
    text: `
  <p>API Gateway から同期で呼び出される Lambda 関数 <code>search</code> で、昨日の午後からエラー応答が急増した。関数には予約済み同時実行数 50 が設定されている。アカウントの同時実行数の上限は 1,000 で、ほかの関数の使用量は少ない。障害時間帯の CloudWatch メトリクスは次のとおりである。</p>
  <table style="border-collapse:collapse;margin:8px 0;font-size:.95em">
  <tr><th style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">メトリクス</th><th style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">前日（正常時）</th><th style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">障害時間帯</th></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">リクエスト数（API Gateway <code>Count</code>）</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">約 60 件/秒</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">約 60 件/秒</td></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left"><code>Duration</code>（平均）</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">約 800 ms</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">約 8,000 ms</td></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left"><code>ConcurrentExecutions</code>（最大）</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">約 48</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">50 で横ばい</td></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left"><code>Throttles</code>（合計）</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">0</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">大量に発生</td></tr>
  <tr><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left"><code>Errors</code>（合計）</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">ほぼ 0</td><td style="border:1px solid rgba(128,128,128,.45);padding:4px 10px;text-align:left">ほぼ 0</td></tr>
  </table>
  <p>X-Ray のトレースでは、関数から呼び出している検索用データベースの応答時間が、障害時間帯に大きく伸びていた。</p>
  <p>このメトリクスの解釈と対応として正しいものはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `必要な同時実行数は「1 秒あたりのリクエスト数 × 平均所要時間（秒）」で見積もれる。障害時間帯は約 60 × 8 = 480 が必要になり、予約済み同時実行数 50 を超えたリクエストがスロットリングされている。`,
        why: `リクエスト数は変わっていませんが、所要時間が 10 倍になったため、同時に処理中のリクエストが増えました。<code>ConcurrentExecutions</code> が予約済み同時実行数の 50 で頭打ちになり、<code>Throttles</code> が大量に出ている一方で <code>Errors</code>（関数コードのエラー）はほぼ 0 です。関数自体は失敗しておらず、上限を超えた呼び出しが拒否されていると判断できます。` },
      { correct: true, html: `検索用データベースの応答が遅くなった原因（クエリやインデックス、負荷など）を調べて解消する。それまでの間は、下流が許容できる範囲で予約済み同時実行数を引き上げ、データベースの呼び出しにはタイムアウトを設定する。`,
        why: `根本原因は下流のデータベースの遅延なので、そちらを解消するのが本質的な対応です。一時的に予約済み同時実行数を引き上げるとスロットリングは減りますが、データベースへの同時接続も増えるため、下流の負荷を見ながら調整します。呼び出しにタイムアウトを設定しておくと、遅延時に実行環境を長時間占有し続けることを防げます。` },
      { correct: false, html: `アカウントの同時実行数の上限に達しているため、Service Quotas で上限の引き上げをリクエストする。`,
        why: `関数の同時実行は 50 で横ばいになっており、アカウントの上限 1,000 には遠く及びません。予約済み同時実行数を設定した関数は、その値が<strong>上限</strong>にもなるため、アカウントの上限を引き上げてもこの関数の同時実行数は 50 から増えません。` },
      { correct: false, html: `プロビジョニングされた同時実行を 100 に設定する。事前に初期化された実行環境が使われるので、予約済み同時実行数の 50 を超えて処理できるようになる。`,
        why: `プロビジョニングされた同時実行は、実行環境を事前に初期化してコールドスタートを減らす機能で、関数の同時実行数の上限を引き上げるものではありません。また、関数の予約済み同時実行数を<strong>超える値は設定できません</strong>。今回は初期化時間ではなく下流の遅延が原因なので、効果もありません。` },
      { correct: false, html: `関数のメモリを 128 MB から 1,024 MB に増やして CPU を増強し、所要時間を短くする。`,
        why: `メモリを増やすと CPU も比例して割り当てられますが、今回の所要時間の大部分は<strong>データベースの応答待ち</strong>です。関数の処理能力を上げても待ち時間は減らないため、スロットリングは解消しません。性能チューニングは、ボトルネックがどこにあるかをトレースなどで確かめてから行います。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>同時実行数の見積もり</strong>: 同時実行数 ≒ 1 秒あたりのリクエスト数 × 平均所要時間（秒）。リクエスト数が同じでも、所要時間が伸びると必要な同時実行数は増える。</li>
  <li><strong>メトリクスの読み方</strong>: <code>Throttles</code> は同時実行数の上限による拒否、<code>Errors</code> は関数コードのエラーやタイムアウト。<code>ConcurrentExecutions</code> が一定値で頭打ちなら、予約済み同時実行数やアカウントの上限を疑う。</li>
  <li><strong>予約済み同時実行数</strong>: 関数のために同時実行数を確保すると同時に、その値を上限にする。下流を保護する目的で意図的に低く設定することもある。</li>
  <li><strong>プロビジョニングされた同時実行</strong>: 初期化済みの実行環境を用意してコールドスタートを減らす。予約済み同時実行数を超えては設定できず、追加料金がかかる。</li>
  <li>同期呼び出しでスロットリングされると呼び出し元にエラーが返るため、クライアント側でも再試行とバックオフを実装しておく。</li>
  </ul>`,
    refs: [
      ["Lambda: 関数のスケーリングと同時実行", "https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html"],
      ["Lambda: 予約済み同時実行数の設定", "https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html"],
      ["Lambda: 関数のメトリクス", "https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html"]
    ]
  },

  /* ---------- Q5: 開発（DynamoDB の Query とページ分割） ---------- */
  {
    id: "q5",
    domain: "分野1 開発",
    tag: "疑似コード",
    type: "single", pick: 1,
    text: `
  <p>DynamoDB テーブル <code>Orders</code> は、パーティションキーが <code>customerId</code>（文字列）、ソートキーが <code>orderDate</code>（ISO 8601 形式の文字列）である。1 人の顧客が数千件の注文を持つことがある。</p>
  <p>開発者は、指定した顧客の 2026 年の注文を<strong>すべて</strong>取得する関数を Python（boto3）で実装する。要件は次のとおりである。</p>
  <ul>
  <li>直前に書き込まれた注文も必ず結果に含める（強い整合性）。</li>
  <li>消費する読み込みキャパシティをできるだけ少なくする。</li>
  </ul>
  <p>要件を満たす実装はどれですか。</p>`,
    options: [
      { correct: true, html: `<pre><code>def get_orders(customer_id):
    items, kwargs = [], {
        "KeyConditionExpression":
            Key("customerId").eq(customer_id)
            &amp; Key("orderDate").between("2026-01-01", "2026-12-31T23:59:59"),
        "ConsistentRead": True,
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp["Items"])
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]</code></pre>`,
        why: `パーティションキーとソートキーの範囲をキー条件式で指定しているので、該当する項目だけを読み取ります。<code>Query</code> は 1 回で最大 1 MB までしか返さないため、<code>LastEvaluatedKey</code> がある限り <code>ExclusiveStartKey</code> に渡して続きを取得します。ベーステーブルへの <code>Query</code> なので <code>ConsistentRead=True</code> で強い整合性の読み込みができます。` },
      { correct: false, html: `<pre><code>def get_orders(customer_id):
    items, kwargs = [], {
        "KeyConditionExpression": Key("customerId").eq(customer_id),
        "FilterExpression": Attr("orderDate").begins_with("2026"),
        "ConsistentRead": True,
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp["Items"])
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]</code></pre>`,
        why: `フィルター式には<strong>パーティションキーやソートキーの属性を含められず</strong>、<code>ValidationException</code> になります（一見できそうで不可能な実装）。ソートキーの条件はキー条件式に書く必要があります。仮にキー以外の属性で絞り込んだとしても、フィルター式は読み取った後に適用されるので、読み込みキャパシティは減りません。` },
      { correct: false, html: `<pre><code>def get_orders(customer_id):
    items, kwargs = [], {
        "KeyConditionExpression":
            Key("customerId").eq(customer_id)
            &amp; Key("orderDate").begins_with("2026"),
        "ConsistentRead": True,
        "Limit": 500,
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp["Items"])
        if len(resp["Items"]) &lt; 500:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]</code></pre>`,
        why: `キー条件式は正しいものの、終了判定に誤りがあります。<code>Query</code> は <code>Limit</code> に達する前に<strong>1 MB の上限</strong>に達すると、それまでの項目だけを <code>LastEvaluatedKey</code> 付きで返します。注文データが大きいと 500 件未満で返ってくるため、続きがあるのにループを抜けてしまい、一部の注文が欠けます。続きがあるかどうかは <code>LastEvaluatedKey</code> の有無で判定します。` },
      { correct: false, html: `<pre><code>def get_orders(customer_id):
    items, kwargs = [], {
        "FilterExpression":
            Attr("customerId").eq(customer_id)
            &amp; Attr("orderDate").begins_with("2026"),
        "ConsistentRead": True,
    }
    while True:
        resp = table.scan(**kwargs)
        items.extend(resp["Items"])
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]</code></pre>`,
        why: `<code>Scan</code> ではキーの属性もフィルター式に書けるため、正しい結果は得られます。しかし、<code>Scan</code> は<strong>テーブル全体を読み取ってから</strong>フィルターを適用するので、ほかの顧客の注文も含めてすべての項目分の読み込みキャパシティを消費します。「読み込みキャパシティをできるだけ少なくする」要件を満たしません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>Query と Scan</strong>: <code>Query</code> はパーティションキーを指定して 1 つのパーティションだけを読む。<code>Scan</code> はテーブル全体を読む。どちらもフィルター式は読み取り後に適用されるため、消費するキャパシティは減らない。</li>
  <li><strong>キー条件式</strong>: パーティションキーは等価条件（<code>=</code>）のみ。ソートキーには <code>=</code>、<code>&lt;</code>、<code>&lt;=</code>、<code>&gt;</code>、<code>&gt;=</code>、<code>BETWEEN</code>、<code>begins_with</code> が使える。</li>
  <li><strong>ページ分割</strong>: 1 回の応答は最大 1 MB。<code>LastEvaluatedKey</code> がなくなるまで <code>ExclusiveStartKey</code> を指定して繰り返す。boto3 の paginator を使うこともできる。</li>
  <li><strong>整合性</strong>: 強い整合性の読み込みはベーステーブルと LSI で使え、結果整合性の 2 倍の読み込みキャパシティを消費する。GSI は結果整合性の読み込みだけをサポートする。</li>
  </ul>`,
    refs: [
      ["DynamoDB: Query のキー条件式", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.KeyConditionExpressions.html"],
      ["DynamoDB: Query のフィルター式", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.FilterExpression.html"],
      ["DynamoDB: クエリ結果のページ分割", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.Pagination.html"],
      ["DynamoDB: 読み込み整合性", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html"]
    ]
  }
  ]
});
