import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as SNS from 'aws-cdk-lib/aws-sns';
import * as IAM from 'aws-cdk-lib/aws-iam';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { VerifySesDomain } from '@iter-idea/ses-verify-identities';

export interface SESProps extends cdk.StackProps {
  project: string;
  identity: string;
  identityArn: string;
  notificationTopicArn?: string;
  dnsMode: 'route53' | 'external';
  domain: string;
}

export class SESStack extends cdk.Stack {
  public readonly identityArn: string;
  public readonly notificationTopicArn: string;

  constructor(scope: Construct, id: string, props: SESProps) {
    super(scope, id, props);

    const domainName = props.domain.split('.').slice(-2).join('.');
    const sesDomain = props.dnsMode === 'route53'
      ? new VerifySesDomain(this, 'DomainIdentity', { domainName })
      : undefined;
    this.identityArn = props.dnsMode === 'route53'
      ? `arn:aws:ses:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:identity/${domainName}`
      : props.identityArn;
    const notificationTopic = props.dnsMode === 'external' && props.notificationTopicArn
      ? SNS.Topic.fromTopicArn(this, 'SESNotificationTopic', props.notificationTopicArn)
      : sesDomain?.notificationTopic ?? new SNS.Topic(this, 'SESNotificationTopic', {
          topicName: `${props.project}-ses-notifications`
        });
    if (props.dnsMode === 'external') {
      notificationTopic.addToResourcePolicy(
        new IAM.PolicyStatement({
          principals: [new IAM.ServicePrincipal('ses.amazonaws.com')],
          actions: ['sns:Publish'],
          resources: [notificationTopic.topicArn],
          conditions: { ArnLike: { 'aws:SourceArn': this.identityArn } }
        })
      );
    }
    this.notificationTopicArn = notificationTopic.topicArn;
    for (const notificationType of ['Bounce', 'Complaint', 'Delivery']) {
      new AwsCustomResource(this, `SES${notificationType}Notification`, {
        onCreate: {
          service: 'SES',
          action: 'setIdentityNotificationTopic',
          parameters: {
            Identity: props.identity,
            NotificationType: notificationType,
            SnsTopic: this.notificationTopicArn
          },
          physicalResourceId: PhysicalResourceId.of(`${props.identity}-${notificationType}`)
        },
        onUpdate: {
          service: 'SES',
          action: 'setIdentityNotificationTopic',
          parameters: {
            Identity: props.identity,
            NotificationType: notificationType,
            SnsTopic: this.notificationTopicArn
          },
          physicalResourceId: PhysicalResourceId.of(`${props.identity}-${notificationType}`)
        },
        onDelete: {
          service: 'SES',
          action: 'setIdentityNotificationTopic',
          parameters: {
            Identity: props.identity,
            NotificationType: notificationType,
            SnsTopic: ''
          }
        },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: [this.identityArn]
        })
      });
    }

    new cdk.CfnOutput(this, 'SESIdentityARN', { value: this.identityArn });
    new cdk.CfnOutput(this, 'SESNotificationTopicARN', { value: this.notificationTopicArn });
    if (props.dnsMode === 'external' && props.notificationTopicArn) {
      new cdk.CfnOutput(this, 'LegacyNotificationTopicExport', {
        value: this.notificationTopicArn,
        exportName: `${props.project}-ses:ExportsOutputRefDomainIdentitySesNotificationTopic44F98B89F797312E`
      });
    }
  }
}
