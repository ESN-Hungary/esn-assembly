import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as SNS from 'aws-cdk-lib/aws-sns';
import * as IAM from 'aws-cdk-lib/aws-iam';

export interface SESProps extends cdk.StackProps {
  project: string;
  identity: string;
  identityArn: string;
}

export class SESStack extends cdk.Stack {
  public readonly identityArn: string;
  public readonly notificationTopicArn: string;

  constructor(scope: Construct, id: string, props: SESProps) {
    super(scope, id, props);

    this.identityArn = props.identityArn;
    const notificationTopic = new SNS.Topic(this, 'SESNotificationTopic', {
      topicName: `${props.project}-ses-notifications`
    });
    notificationTopic.addToResourcePolicy(
      new IAM.PolicyStatement({
        principals: [new IAM.ServicePrincipal('ses.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [notificationTopic.topicArn],
        conditions: { ArnLike: { 'aws:SourceArn': this.identityArn } }
      })
    );
    this.notificationTopicArn = notificationTopic.topicArn;
    for (const notificationType of ['Bounce', 'Complaint', 'Delivery']) {
      new cdk.CfnResource(this, `SES${notificationType}Notification`, {
        type: 'AWS::SES::IdentityNotificationTopic',
        properties: {
          Identity: props.identity,
          NotificationType: notificationType,
          TopicArn: this.notificationTopicArn
        }
      });
    }

    new cdk.CfnOutput(this, 'SESIdentityARN', { value: this.identityArn });
    new cdk.CfnOutput(this, 'SESNotificationTopicARN', { value: this.notificationTopicArn });
  }
}
