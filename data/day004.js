/* DVA-C02 模擬試験 Day 004 問題データ
 * type: "single" | "multi" / pick: 選択数
 * options[].correct: 正解フラグ / options[].why: 選択肢ごとの解説
 */
(window.DVA_EXAMS = window.DVA_EXAMS || []).push({
  day: "004",
  date: "2026-09-26",
  title: "Kinesis ストリーム処理・ログのデータ保護・コンテナイメージ デプロイ・Logs Insights・API Gateway の検証と変換",
  minutes: 10,
  questions: [
  /* ---------- Q1: 重量級（分野1・4 横断） ---------- */
  {
    id: "q1",
    domain: "分野1 開発 / 分野4 トラブルシューティングと最適化",
    tag: "重量級シナリオ・疑似コード",
    type: "multi", pick: 3,
    text: `
  <p>ある工場では、約 2,000 台のセンサーが 1 秒ごとに計測値を送信している。収集用アプリケーション（Python）が、プロビジョンドモード・4 シャードの Amazon Kinesis Data Streams ストリーム <code>telemetry</code> に次のコードでレコードを書き込んでいる。</p>
  <pre><code>records = [
    {"Data": json.dumps(r).encode(), "PartitionKey": "telemetry"}
    for r in batch
]
kinesis.put_records(StreamName="telemetry", Records=records)</code></pre>
  <p>ストリームは Lambda 関数 <code>aggregate</code> のイベントソースマッピング（既定設定）で処理されている。運用中に次の問題が発生している。</p>
  <ul>
  <li>書き込み時に <code>ProvisionedThroughputExceededException</code> が頻発する。シャード単位のメトリクスでは、1 つのシャードにだけ書き込みが集中している。</li>
  <li>形式が壊れたレコードが 1 件混入すると関数がエラーになり続け、そのシャードの処理が何時間も止まる。</li>
  <li>関数 1 回あたりの処理時間が長く、<code>IteratorAge</code> メトリクスが増え続けている。</li>
  </ul>
  <p>要件は次のとおりである。シャード数は増やさない。<strong>同じセンサーのレコードは送信順に処理</strong>されなければならない。処理できないレコードがあってもシャードの処理を止めず、後から該当レコードを特定できる情報を Amazon SQS キューに残す。</p>
  <p>これらの要件を満たすために実施すべきことはどれですか。</p>`,
    options: [
      { correct: true, html: `プロデューサーのコードを次のように変更する。
  <pre><code>records = [
    {"Data": json.dumps(r).encode(), "PartitionKey": r["sensorId"]}
    for r in batch
]
resp = kinesis.put_records(StreamName="telemetry", Records=records)
if resp["FailedRecordCount"] &gt; 0:
    failed = [rec for rec, res in zip(records, resp["Records"])
              if "ErrorCode" in res]
    # 指数バックオフで待機してから failed だけを再送する</code></pre>`,
        why: `Kinesis はパーティションキーの MD5 ハッシュでレコードを書き込むシャードを決めます。固定値 <code>"telemetry"</code> ではすべてのレコードが 1 つのシャードに入り、シャードあたりの書き込み上限（毎秒 1 MB または 1,000 レコード）を超えてしまいます。約 2,000 種類あるカーディナリティの高い <code>sensorId</code> をキーにすると 4 シャードに分散し、同じセンサーのレコードは常に同じシャードに入るので順序も保たれます。<code>PutRecords</code> は一部のレコードだけ失敗しても例外にならないため、<code>FailedRecordCount</code> を確認して失敗分だけを再送する処理も必要です。` },
      { correct: false, html: `プロデューサーのパーティションキーを、レコードごとに <code>str(uuid.uuid4())</code> で生成したランダムな値に変更し、書き込みをすべてのシャードに均等に分散させる。`,
        why: `書き込みは均等に分散しますが、同じセンサーのレコードが別々のシャードに入ります。Kinesis が順序を保証するのはシャード内だけなので、シャードをまたぐと処理順は保証されず、「同じセンサーのレコードは送信順に処理」という要件を満たせません。` },
      { correct: true, html: `イベントソースマッピングで <code>BisectBatchOnFunctionError</code> を有効にし、<code>MaximumRetryAttempts</code> を 2 に設定する。さらに失敗時の送信先（<code>DestinationConfig</code> の <code>OnFailure</code>）に SQS キューを指定する。`,
        why: `ストリームのイベントソースマッピングの既定では、<code>MaximumRetryAttempts</code> が -1（無制限）で、レコードの有効期限が切れるまで同じバッチを再試行し続けます。そのためシャードの処理が止まります。再試行回数を制限し、バッチ分割（エラー時にバッチを半分に分けて再試行）を有効にすると、問題のレコードを絞り込んだうえで破棄して処理を先に進められます。失敗時の送信先には、シャード ID と開始・終了シーケンス番号などのメタデータが送られるので、後から該当レコードを特定できます。` },
      { correct: false, html: `関数の非同期呼び出し設定で最大再試行回数を 2 にし、関数のデッドレターキューとして SQS キューを設定する。`,
        why: `イベントソースマッピングは関数を<strong>同期</strong>で呼び出します。非同期呼び出し用の再試行設定や関数の DLQ は、S3 や SNS、EventBridge などからの非同期呼び出しにだけ使われ、Kinesis の処理には効きません。ストリームの失敗処理は、イベントソースマッピング側の設定（再試行回数、レコードの最大有効期間、バッチ分割、失敗時の送信先）で行います。` },
      { correct: true, html: `イベントソースマッピングの <code>ParallelizationFactor</code> を 1 から 5 に引き上げる。`,
        why: `並列化係数（1〜10）を上げると、1 つのシャードを最大 10 個の関数インスタンスで同時に処理できます。Lambda はパーティションキーごとに振り分けて処理するため、<strong>同じパーティションキーのレコードの順序は保たれます</strong>。シャードを増やさずに処理能力を上げ、<code>IteratorAge</code> を減らす方法として適しています。` },
      { correct: false, html: `関数の予約済み同時実行数を 100 に設定し、ストリームを読み取る関数インスタンスの数を増やす。`,
        why: `Kinesis のイベントソースマッピングで同時に動く関数インスタンスの数は、<strong>シャード数 × 並列化係数</strong>で決まります（既定では 4 シャード × 1 = 4）。予約済み同時実行数は上限を予約するだけなので、100 に設定しても読み取りの並列度は増えず、<code>IteratorAge</code> は改善しません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <p>この問題は「ストリーミングデータの処理（分野1）」「高カーディナリティのパーティションキー（分野1）」「メトリクスの解釈と同時実行の理解（分野4）」を横断しています。</p>
  <ul>
  <li><strong>ホットシャード</strong>: 1 つのシャードにだけ書き込みが偏って <code>ProvisionedThroughputExceededException</code> が出る場合は、パーティションキーの偏りを疑う。順序が必要な単位（ここでは <code>sensorId</code>）をキーにすると、分散と順序保証を両立できる。</li>
  <li><strong>ポイズンピル対策</strong>: ストリーム処理では 1 件の不正レコードがシャード全体を止めることがある。<code>MaximumRetryAttempts</code>、<code>MaximumRecordAgeInSeconds</code>、<code>BisectBatchOnFunctionError</code>、失敗時の送信先（SQS / SNS / S3）を組み合わせる。関数から <code>batchItemFailures</code> を返す部分バッチ応答（<code>ReportBatchItemFailures</code>）を使うと、失敗したシーケンス番号から再試行できる。</li>
  <li><strong>IteratorAge</strong>: ストリームに書き込まれてから関数が読み取るまでの遅れを表す。増え続ける場合は、並列化係数、バッチサイズ、関数のメモリ（CPU）、処理内容の見直しを検討する。</li>
  <li><strong>同時実行の決まり方</strong>: ストリームの読み取りはシャード数 × 並列化係数で決まり、予約済み同時実行数を上げても増えない。</li>
  </ul>`,
    refs: [
      ["Lambda: Kinesis Data Streams での Lambda の使用", "https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html"],
      ["Lambda: イベントソースマッピング", "https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html"],
      ["Lambda: 関数の同時実行", "https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html"],
      ["Kinesis Data Streams: 用語と概念", "https://docs.aws.amazon.com/streams/latest/dev/key-concepts.html"],
      ["Kinesis Data Streams: プロデューサーのトラブルシューティング", "https://docs.aws.amazon.com/streams/latest/dev/troubleshooting-producers.html"]
    ]
  },

  /* ---------- Q2: セキュリティ（ログの機密データのマスキング） ---------- */
  {
    id: "q2",
    domain: "分野2 セキュリティ",
    tag: "最小限の構成作業量",
    type: "single", pick: 1,
    text: `
  <p>ある会社の会員管理システムでは、複数の Lambda 関数がデバッグのためにリクエスト内容を Amazon CloudWatch Logs に出力している。監査の結果、ログにメールアドレスとクレジットカード番号が平文で含まれていることがわかった。</p>
  <p>セキュリティ部門は次の対応を求めている。</p>
  <ul>
  <li>ログを参照する開発者には、これらの値がマスクされた状態で表示される。</li>
  <li>セキュリティ部門の担当者だけは、必要なときにマスクされていない値を確認できる。</li>
  <li>関数のコードはすぐには変更できない。</li>
  </ul>
  <p>最小限の構成作業量でこの要件を満たすには、どうすればよいですか。</p>`,
    options: [
      { correct: true, html: `対象のロググループに CloudWatch Logs のデータ保護ポリシーを設定し、マネージドデータ識別子の <code>EmailAddress</code> と <code>CreditCardNumber</code> を指定する。セキュリティ部門の担当者の IAM ロールにだけ <code>logs:Unmask</code> を許可する。`,
        why: `CloudWatch Logs のデータ保護ポリシーを設定すると、ロググループに取り込まれるログイベントから機密データが自動で検出され、表示時にマスクされます。メールアドレスやクレジットカード番号はマネージドデータ識別子として用意されているため、正規表現を書く必要もありません。マスクされていない値を見られるのは <code>logs:Unmask</code> 権限を持つプリンシパルだけです。関数のコード変更は不要で、設定もロググループ（またはアカウント）単位のポリシーだけで済みます。` },
      { correct: false, html: `Amazon Macie を有効にし、CloudWatch Logs のロググループを機密データ検出ジョブの対象に指定して、検出された値をマスクさせる。`,
        why: `Macie の機密データ検出ジョブが対象にできるのは <strong>Amazon S3 バケット内のオブジェクト</strong>だけで、CloudWatch Logs のロググループを直接スキャンすることはできません（一見できそうで不可能な構成）。また、Macie は検出結果を報告するサービスで、元のデータをマスクする機能はありません。` },
      { correct: false, html: `ロググループにカスタマーマネージドの AWS KMS キーを関連付けて暗号化し、キーポリシーでセキュリティ部門の担当者のロールにだけ <code>kms:Decrypt</code> を許可する。`,
        why: `ロググループの KMS 暗号化は<strong>保管中のデータ</strong>を保護する仕組みです。ログを読み取るときは CloudWatch Logs が復号して返すため、ログを参照できる開発者にも値は平文で表示されます。「表示時にマスクする」という要件は満たせません。` },
      { correct: false, html: `ロググループにサブスクリプションフィルターを作成して Amazon Data Firehose にログを送り、データ変換用の Lambda 関数でメールアドレスとカード番号を置換してから Amazon S3 に保存する。開発者には S3 のログだけを参照させる。`,
        why: `マスク済みのコピーは作れますが、変換用の関数（正規表現による検出処理を含む）、Firehose、S3、アクセス制御の設計が必要になり、作業量が多くなります。元のロググループには平文の値が残るため、そこへのアクセスを別途制限する必要もあります。最小限の構成作業量とは言えません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>CloudWatch Logs のデータ保護</strong>: データ保護ポリシーを設定すると、以降に取り込まれるログイベントの機密データ（PII、認証情報、金融情報など）を検出してマスクする。ロググループ単位とアカウント単位で設定でき、検出結果の監査レポートを別のロググループ、S3、Firehose に出力できる。</li>
  <li><strong>マスク解除の権限</strong>: <code>logs:Unmask</code> を持つプリンシパルだけが、コンソールや <code>GetLogEvents</code>、<code>FilterLogEvents</code>、Logs Insights（<code>unmask()</code> 関数）で元の値を確認できる。</li>
  <li>ポリシーを設定する前に取り込まれたログはマスクされない。根本的には、アプリケーション側でも機密データをログに出さない（サニタイズする）実装が望ましい。</li>
  <li><strong>暗号化とマスキングの違い</strong>: 暗号化は保管中・転送中のデータを保護し、マスキングは権限のない人に表示される値を隠す。目的が違うので、要件に合わせて使い分ける。</li>
  </ul>`,
    refs: [
      ["CloudWatch Logs: マスキングによる機密ログデータの保護", "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data.html"],
      ["CloudWatch Logs: AWS KMS を使用したログデータの暗号化", "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html"],
      ["Amazon Macie とは", "https://docs.aws.amazon.com/macie/latest/user/what-is-macie.html"]
    ]
  },

  /* ---------- Q3: デプロイ（Lambda のパッケージング） ---------- */
  {
    id: "q3",
    domain: "分野3 デプロイ",
    tag: "パッケージングの選択",
    type: "multi", pick: 2,
    text: `
  <p>開発者は、機械学習モデルで推論を行う Python の Lambda 関数を AWS SAM で管理している。ライブラリとモデルファイルを合わせた依存関係は、展開後に約 1.2 GB になる。</p>
  <p>要件は次のとおりである。</p>
  <ul>
  <li>コード・依存関係・モデルを 1 つのアーティファクトとしてバージョン管理し、まとめてデプロイする。</li>
  <li>関数は VPC に接続しない。</li>
  </ul>
  <p>この要件を満たすデプロイ方法として正しいものはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `次の Dockerfile でイメージをビルドし、同じリージョンの Amazon ECR リポジトリにプッシュする。そのイメージの URI を指定し、パッケージタイプを <code>Image</code> として関数を作成する。
  <pre><code>FROM public.ecr.aws/lambda/python:3.12
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY app.py model/ ./
CMD ["app.handler"]</code></pre>`,
        why: `コンテナイメージとしてデプロイする関数は、非圧縮で最大 10 GB のイメージを使えます。AWS 提供のベースイメージにはランタイムとランタイムインターフェイスクライアントが含まれているので、依存関係とコードを追加し、<code>CMD</code> にハンドラーを指定するだけで動きます。イメージは Amazon ECR に置き、関数から参照します。` },
      { correct: true, html: `SAM テンプレートの関数リソースで <code>PackageType: Image</code> を指定し、<code>Metadata</code> に <code>Dockerfile</code> と <code>DockerContext</code> を記述する。<code>sam build</code> でイメージをビルドし、<code>sam deploy --resolve-image-repos</code> でデプロイする。`,
        why: `AWS SAM はコンテナイメージの関数に対応しています。<code>Metadata</code> の情報をもとに <code>sam build</code> がイメージをビルドし、<code>sam deploy</code> が ECR へのプッシュと関数の更新を行います。<code>--resolve-image-repos</code> を付けると、必要な ECR リポジトリも SAM が自動で作成・管理します。` },
      { correct: false, html: `依存関係を 5 つの Lambda レイヤーに分けて、それぞれ 250 MB 未満の .zip ファイルにする。関数には 5 つのレイヤーをすべて追加し、関数コードだけを .zip でデプロイする。`,
        why: `.zip 形式の関数の 250 MB（展開後）の上限は、<strong>関数コードとすべてのレイヤーの合計</strong>に適用されます。レイヤーに分けても合計 1.2 GB は上限を超えるためデプロイできません。また、レイヤーは関数とは別にバージョン管理されるので、「1 つのアーティファクトで管理する」という要件にも合いません。` },
      { correct: false, html: `依存関係を含む .zip ファイルを Amazon S3 にアップロードし、関数のコードとして S3 のバケットとキーを指定する。S3 からデプロイすると 250 MB の上限は適用されない。`,
        why: `S3 経由にすると圧縮時 50 MB を超える .zip ファイルもアップロードできますが、<strong>展開後 250 MB の上限</strong>は S3 からデプロイしても変わりません。1.2 GB の依存関係は .zip 形式では扱えません。` },
      { correct: false, html: `<code>public.ecr.aws/lambda/python:3.12</code> をベースにしたイメージで関数を作成し、共通ライブラリは Lambda レイヤーとして関数に追加して、イメージのサイズを小さくする。`,
        why: `コンテナイメージとしてデプロイする関数では、<strong>Lambda レイヤーを使えません</strong>（一見できそうで不可能な構成）。共通の依存関係を使いたい場合は、イメージのビルド時に取り込みます（マルチステージビルドや共通ベースイメージを使うなど）。` },
      { correct: false, html: `Docker Hub の <code>python:3.12-slim</code> をベースにしたイメージを Docker Hub のリポジトリにプッシュし、そのイメージの URI を関数に指定する。`,
        why: `Lambda 関数に指定できるのは <strong>Amazon ECR のプライベートリポジトリ</strong>にあるイメージだけで、Docker Hub のイメージ URI は直接指定できません。さらに、AWS 以外のベースイメージを使う場合は、ランタイムインターフェイスクライアント（Python では <code>awslambdaric</code>）をイメージに追加する必要があります。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>パッケージングの上限</strong>: .zip 形式は直接アップロードで 50 MB（圧縮時）、展開後はコードとレイヤーの合計で 250 MB。コンテナイメージ形式は最大 10 GB。</li>
  <li><strong>コンテナイメージの条件</strong>: イメージは ECR（プライベートリポジトリ）に置く。AWS ベースイメージ以外を使う場合はランタイムインターフェイスクライアントを含める。レイヤーは使えない。ローカルでのテストにはランタイムインターフェイスエミュレーター（AWS ベースイメージには同梱）が使える。</li>
  <li><strong>SAM の役割</strong>: <code>PackageType: Image</code> と <code>Metadata</code>（<code>Dockerfile</code>、<code>DockerContext</code>、<code>DockerTag</code>）を書けば、ビルド・プッシュ・デプロイを SAM CLI に任せられる。</li>
  <li>大きなモデルをコードとは別に更新したい場合は、Amazon EFS をマウントする方法もあるが、関数を VPC に接続する必要がある。</li>
  </ul>`,
    refs: [
      ["Lambda: コンテナイメージを使った関数の作成", "https://docs.aws.amazon.com/lambda/latest/dg/images-create.html"],
      ["Lambda: クォータ（デプロイパッケージのサイズ）", "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html"],
      ["Lambda: レイヤーの管理", "https://docs.aws.amazon.com/lambda/latest/dg/chapter-layers.html"],
      ["AWS SAM CLI: sam deploy", "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-deploy.html"]
    ]
  },

  /* ---------- Q4: トラブルシューティング（Logs Insights） ---------- */
  {
    id: "q4",
    domain: "分野4 トラブルシューティングと最適化",
    tag: "ログクエリ",
    type: "single", pick: 1,
    text: `
  <p>ある Lambda 関数（ログ形式はテキスト）の応答が遅いという報告があった。関数のロググループには、呼び出しごとに次のような行が出力されている。</p>
  <pre><code>START RequestId: 8f2c... Version: $LATEST
END RequestId: 8f2c...
REPORT RequestId: 8f2c... Duration: 2873.41 ms Billed Duration: 2874 ms
  Memory Size: 512 MB Max Memory Used: 498 MB Init Duration: 1204.77 ms</code></pre>
  <p>開発者は CloudWatch Logs Insights を使って、直近 1 時間のうち<strong>所要時間が長い呼び出しの上位 10 件</strong>を、リクエスト ID、所要時間、最大メモリ使用量（MB）、初期化時間とともに一覧表示したい。初期化時間はコールドスタートの呼び出しにだけ表示されればよい。</p>
  <p>どのクエリを実行すればよいですか。</p>`,
    options: [
      { correct: true, html: `<pre><code>filter @type = "REPORT"
| fields @requestId, @duration,
         @maxMemoryUsed / 1000 / 1000 as maxMemoryMB,
         @initDuration
| sort @duration desc
| limit 10</code></pre>`,
        why: `Lambda のロググループでは、Logs Insights が <code>REPORT</code> 行から <code>@type</code>、<code>@requestId</code>、<code>@duration</code>、<code>@billedDuration</code>、<code>@memorySize</code>、<code>@maxMemoryUsed</code>（バイト単位）、<code>@initDuration</code> などのフィールドを自動で検出します。<code>REPORT</code> 行に絞り込み、所要時間の降順に並べて 10 件に制限すれば要件どおりです。<code>@initDuration</code> はコールドスタートのときだけ値が入ります。` },
      { correct: false, html: `<pre><code>filter @type = "START"
| fields @requestId, @duration, @maxMemoryUsed, @initDuration
| sort @duration desc
| limit 10</code></pre>`,
        why: `<code>START</code> 行には所要時間やメモリ使用量の情報が含まれていません。これらは呼び出しの終了時に出力される <code>REPORT</code> 行にだけ記録されるため、このクエリでは所要時間で並べ替えられません。` },
      { correct: false, html: `<pre><code>filter @type = "REPORT" and ispresent(@initDuration)
| fields @requestId, @duration,
         @maxMemoryUsed / 1000 / 1000 as maxMemoryMB,
         @initDuration
| sort @duration desc
| limit 10</code></pre>`,
        why: `<code>ispresent(@initDuration)</code> の条件によって、<strong>コールドスタートの呼び出しだけ</strong>に絞り込まれます。ウォームスタートでも所要時間が長い呼び出しは結果から漏れるので、「すべての呼び出しのうち上位 10 件」という要件を満たしません。` },
      { correct: false, html: `<pre><code>filter @type = "REPORT"
| stats max(@duration) as maxDuration,
        max(@maxMemoryUsed / 1000 / 1000) as maxMemoryMB
  by bin(5m)
| sort maxDuration desc
| limit 10</code></pre>`,
        why: `5 分ごとの時間帯で集計した最大値を表示するクエリです。個々の呼び出しのリクエスト ID は出力されず、所要時間の最大値とメモリの最大値が別々の呼び出しのものである可能性もあります。傾向の把握には使えますが、遅い呼び出しを特定するという要件は満たせません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>自動検出フィールド</strong>: Lambda のログでは <code>REPORT</code> 行から性能関連のフィールドが自動で取り出される。すべてのログには <code>@timestamp</code>、<code>@message</code>、<code>@logStream</code> がある。JSON 形式のログでは JSON のキーもフィールドとして検出される。</li>
  <li><strong>主なコマンド</strong>: <code>fields</code>（表示・計算）、<code>filter</code>（絞り込み）、<code>stats</code>（集計、<code>by bin()</code> で時間ごと）、<code>sort</code>、<code>limit</code>、<code>parse</code>（非構造化ログから値を取り出す）。</li>
  <li><strong>メモリの判断</strong>: <code>@maxMemoryUsed</code> が <code>@memorySize</code> に近い場合はメモリ不足の可能性がある。Lambda ではメモリに比例して CPU も割り当てられるため、メモリを増やすと所要時間が短くなることがある。</li>
  <li><strong>コールドスタート</strong>: <code>@initDuration</code> が大きい場合は、初期化処理の見直し、プロビジョニングされた同時実行、SnapStart（対応ランタイム）を検討する。</li>
  </ul>`,
    refs: [
      ["CloudWatch Logs Insights: サポートされるログと検出されるフィールド", "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_AnalyzeLogData-discoverable-fields.html"],
      ["CloudWatch Logs Insights: クエリ構文", "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html"],
      ["Lambda: 関数のログの操作", "https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html"]
    ]
  },

  /* ---------- Q5: 開発（API Gateway の検証と変換） ---------- */
  {
    id: "q5",
    domain: "分野1 開発",
    tag: "API の拡張・設定の選択",
    type: "multi", pick: 2,
    text: `
  <p>ある会社は、Amazon API Gateway の REST API で既存の在庫管理システムを公開している。<code>POST /items</code> と <code>GET /items/{id}</code> は、どちらも HTTP 統合（非プロキシ）で既存のバックエンドに接続されている。開発者は次の改修を依頼された。</p>
  <ul>
  <li><code>POST /items</code> で、リクエスト本文に必須項目 <code>name</code>（文字列）と <code>quantity</code>（整数）がない場合は、<strong>バックエンドを呼び出さずに</strong> 400 を返す。</li>
  <li><code>GET /items/{id}</code> で、バックエンドは商品が見つからないときもステータスコード 200 と本文 <code>{"error": "NOT_FOUND"}</code> を返す。バックエンドは変更せずに、この場合はクライアントに 404 を返す。</li>
  </ul>
  <p>これらの要件を満たすために実施すべきことはどれですか。<strong>2 つ</strong>選択してください。</p>`,
    options: [
      { correct: true, html: `<code>name</code> と <code>quantity</code> を <code>required</code> とする JSON スキーマのモデルを作成し、<code>POST /items</code> のメソッドリクエストに設定する。リクエスト検証で「本文を検証」を有効にする。`,
        why: `REST API のリクエスト検証を有効にすると、API Gateway はメソッドリクエストの段階で本文をモデル（JSON スキーマ draft 4）と照合します。検証に失敗した場合は統合（バックエンド）を呼び出さずに 400 を返すので、バックエンドの負荷も減ります。` },
      { correct: true, html: `<code>GET /items/{id}</code> の統合レスポンスに、次のマッピングテンプレートを設定する。
  <pre><code>#set($body = $input.path('$'))
#if($body.error == "NOT_FOUND")
  #set($context.responseOverride.status = 404)
#end
$input.json('$')</code></pre>`,
        why: `非プロキシ統合では、統合レスポンスのマッピングテンプレートで <code>$context.responseOverride.status</code> を設定すると、クライアントに返すステータスコードを上書きできます。バックエンドの本文の内容に応じて 404 を返せるので、バックエンドを変更する必要はありません。` },
      { correct: false, html: `API を HTTP API に移行し、<code>POST /items</code> のルートに JSON スキーマのモデルを関連付けてリクエスト検証を有効にする。`,
        why: `HTTP API は、モデルによるリクエスト本文の検証をサポートしていません（一見できそうで不可能な構成）。リクエスト検証、マッピングテンプレートによる変換などは REST API の機能です。移行すると 2 つ目の要件にも対応しにくくなります。` },
      { correct: false, html: `ゲートウェイレスポンスの <code>DEFAULT_4XX</code> を編集し、バックエンドの本文に <code>NOT_FOUND</code> が含まれる場合はステータスコードを 404 に変更する。`,
        why: `ゲートウェイレスポンスは、認証エラーや検証エラー、スロットリングなど、<strong>API Gateway 自身が生成するエラー応答</strong>をカスタマイズする機能です。バックエンドが返した 200 の応答には適用されず、本文の内容で条件分岐することもできません。` },
      { correct: false, html: `API Gateway に GraphQL エンドポイントを作成し、スキーマで <code>name</code> と <code>quantity</code> を必須（<code>String!</code>、<code>Int!</code>）として定義する。`,
        why: `API Gateway には GraphQL エンドポイントを作成する機能はありません（一見できそうで不可能な構成）。GraphQL API を AWS で提供するには AWS AppSync を使います。そもそも既存の REST API の改修という要件にも合いません。` }
    ],
    explanation: `
  <h4>ポイント</h4>
  <ul>
  <li><strong>リクエスト検証（REST API）</strong>: 検証の種類は「本文を検証」「クエリ文字列パラメータとヘッダーを検証」「両方」。必須パラメータやモデルに合わない場合は、統合を呼び出す前に 400 を返す。</li>
  <li><strong>マッピングテンプレート</strong>: 非プロキシ統合で VTL（Velocity Template Language）を使ってリクエストやレスポンスを変換する。<code>$context.requestOverride</code> / <code>$context.responseOverride</code> でヘッダーやステータスコードも上書きできる。プロキシ統合では使えない。</li>
  <li><strong>ステータスコードの対応付け</strong>: 統合レスポンスの正規表現（HTTP 統合ではバックエンドのステータスコード、Lambda 非プロキシ統合ではエラーメッセージ）でメソッドレスポンスの状態コードに対応付ける方法もある。本文の内容で判断するならマッピングテンプレートでの上書きが適している。</li>
  <li><strong>ゲートウェイレスポンス</strong>: <code>MISSING_AUTHENTICATION_TOKEN</code>、<code>BAD_REQUEST_BODY</code>、<code>THROTTLED</code> など API Gateway が生成する応答の本文やヘッダーをカスタマイズする（CORS ヘッダーの追加など）。</li>
  </ul>`,
    refs: [
      ["API Gateway: REST API のリクエスト検証", "https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html"],
      ["API Gateway: パラメータとステータスコードの上書き", "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-override-request-response-parameters.html"],
      ["API Gateway: ゲートウェイレスポンス", "https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-gatewayResponse-definition.html"],
      ["API Gateway: HTTP API と REST API の選択", "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html"]
    ]
  }
  ]
});
