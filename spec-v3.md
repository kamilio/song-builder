We'll be adding new features to the application. First one is music. Ability to select a model from a drop down. It will be using V1 models and it will filter out all models that are newer than Six months and cost more than 2 dollars per million input

<https://api.poe.com/v1/models>

prices are in USD per 1 token, so we'll need to convert

So the selection will be in settings

Let's talk about the image generation. So it will need a remix feature. So you can upload an image and then it will be sent in base64 to the to the model I think. Then we'll need for images also model selection. This model section won't be in settings. It should be on the session page. And uh the models are gonna be like are not gonna be from V1 models. I'll hard code them. And there must be uh whether it supports remix, true false, and extra body uh parameter that I also hard code. Then we will also need like on the landing page there is the recent sessions but also view all sessions and then from the menu view all sessions.
