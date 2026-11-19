# BRAND NOTE (added by the user's assistant, not part of the original prompt)

The product's chosen brand name is **Nooktour** (preferred domain nooktour.com). The prompt below calls the product "3D Apartment Guest Assistant", which is the working description. Use Nooktour as the brand/product name in the UI, docs and repo.
- The domain has NOT been purchased, the trademark has NOT been cleared or filed, and no social accounts exist. Research: `docs/BRAND_IDENTITY.md`.
- Project root: `C:\Users\Dev Prince\Projects\nooktour`. Do not touch sibling projects (`beadup`, `PaMarket`).

---

# MASTER PROJECT PROMPT
# 3D APARTMENT GUEST ASSISTANT
## Complete Product Development, Architecture, Implementation and Production Plan

You are taking ownership of a new software product called **3D Apartment Guest Assistant**.

Your responsibility is to take this product from its initial concept through architecture, development, testing, security verification and production deployment.

You are acting as the Lead Software Architect, Full-Stack Developer, 3D/XR Engineer, Backend Engineer, Cloud Infrastructure Engineer, Database Architect, UI/UX Designer and Application Security Engineer.

You must understand the complete product before writing application code.

This is the master instruction for the entire project. Follow it throughout development.

---

# PART 1: UNDERSTAND WHAT WE ARE BUILDING

## 1.1 Product vision

We are building a cloud-based interactive 3D apartment assistant for short-term rental apartments, serviced apartments, hotels and property management companies.

The product allows a property manager to scan an actual apartment, convert the captured footage into a photorealistic, connected 3D apartment, and add interactive information to appliances and important objects.

Guests access the experience by scanning a QR code placed inside the apartment.

The guest opens a browser-based experience without downloading an application or creating an account.

The guest can explore the actual apartment in 3D, move between rooms, select appliances and receive instructions on how to use them.

The guest can also search directly for an appliance when they need an immediate answer.

**The photorealistic 3D apartment is the central product experience. Direct search is a complementary feature. Do not replace the 3D experience with a conventional QR guidebook.**

## 1.2 The problem we are solving

Guests staying in apartments frequently need help with:

- Air conditioning.
- Television and remotes.
- Washing machines.
- Dishwashers.
- Ovens and microwaves.
- Coffee machines.
- Induction cookers.
- Water heaters.
- Smart locks.
- Intercoms.
- Lighting.
- Electrical controls.
- Wi-Fi.
- Other apartment equipment.

Property managers repeatedly answer similar questions.

Our product should help guests independently understand how to use apartment facilities while reducing repetitive support requests.

The experience must make it easy to understand both:

1. Where an appliance or important object is located.
2. How to operate that specific appliance or object.

## 1.3 Initial pilot

We have access to 13 apartments for testing and validation.

We will begin with one real apartment, validate the complete workflow, then expand to additional apartments.

Initial capture device: iPhone 16 Pro Max.

The architecture must support expansion beyond these initial apartments.

Do not hardcode the product around one building, one property manager or one apartment.

---

# PART 2: COMPLETE PRODUCT EXPERIENCE

## 2.1 Property manager experience

A property manager must have a secure dashboard.

The manager should be able to:

1. Register and log in.
2. Create an organization.
3. Create properties.
4. Add individual apartments.
5. Manage apartment information.
6. Start a new 3D apartment capture.
7. Choose direct scanning or existing video upload.
8. Follow guided room-by-room capture instructions.
9. Upload and process apartment footage.
10. Monitor processing progress.
11. Preview the generated 3D apartment.
12. Review room continuity and visual quality.
13. Correct missing or inaccurate information.
14. Add interactive appliance hotspots.
15. Assign each appliance to its correct room.
16. Add appliance brand and model information.
17. Add instructional text, images and videos.
18. Verify appliance instructions.
19. Preview the guest experience.
20. Publish the apartment.
21. Generate and manage its QR code.
22. Update apartment information when equipment changes.
23. View guest engagement and analytics.

The dashboard must be simple enough for a property manager who is not technically experienced.

## 2.2 Apartment scanning

Scanning is one of the most important parts of the product.

Support two capture methods.

### Method A: Direct scanning inside our application

The manager opens the application and selects an apartment.

They tap Start New Scan.

The application opens the camera and guides them through the apartment.

The capture workflow must include checkpoints such as:

1. Entrance and initial orientation.
2. Living room.
3. Kitchen.
4. Bedroom one.
5. Additional bedrooms.
6. Bathrooms.
7. Hallways.
8. Other relevant spaces.
9. Final coverage check.

The exact checkpoints should adapt to the apartment layout.

The application should guide the manager through the apartment rather than relying on one uncontrolled recording.

Where technically supported, provide:
- Capture progress.
- Coverage feedback.
- Blur detection.
- Lighting feedback.
- Movement guidance.
- Missing-area warnings.
- Recording quality checks.
- Instructions for reconnecting room transitions.

The manager should be able to pause, resume and review the recording.

Save the original recording securely until processing and quality validation finish.

### Method B: Upload an existing video

The manager must also be able to select a previously recorded apartment walkthrough from their device.

The system must:
- Validate the file.
- Validate supported video formats.
- Enforce upload limits.
- Upload securely.
- Show upload progress.
- Check whether the footage is suitable.
- Submit it for reconstruction.
- Display processing status.
- Explain errors.
- Request additional footage when necessary.

Both capture methods must feed into the same reconstruction pipeline.

### Important technical requirement

A video does not automatically guarantee a perfect 3D reconstruction.

Research and select technology capable of producing the closest practical result to a photorealistic digital representation of the actual apartment.

Evaluate Gaussian Splatting and other relevant reconstruction approaches.

Do not confuse simplified architectural room models with photographic 3D reconstructions.

The output must preserve the actual visual appearance of the apartment as much as technically possible.

---

# PART 3: THE 3D APARTMENT EXPERIENCE

## 3.1 Connected apartment

The apartment must appear as one connected environment.

It must not become a collection of unrelated room images.

Guests should be able to understand how the rooms connect and navigate between them.

Evaluate the best approach for:
- Spatial reconstruction.
- Room alignment.
- Camera positioning.
- Room transitions.
- Doorway continuity.
- 3D scene organization.
- Asset optimization.
- Mobile rendering.

The system must preserve a logical relationship between rooms and objects.

## 3.2 Interactive hotspots

Managers must be able to add clickable hotspots to the 3D apartment.

Examples:

- Living room AC.
- Bedroom AC.
- Television.
- Washing machine.
- Coffee machine.
- Oven.
- Dishwasher.
- Smart lock.
- Water heater.
- Wi-Fi router.
- Electrical panel.

Each hotspot must be connected to a real object in the correct room.

A hotspot should have:
- Unique identifier.
- Apartment identifier.
- Room identifier.
- Object name.
- Object category.
- Brand.
- Model.
- 3D position or spatial anchor.
- Reference image.
- Instructions.
- Instructional video.
- Troubleshooting information.
- Verification status.
- Publication status.

Hotspots must remain correctly positioned when the 3D experience loads on different screen sizes.

Managers must be able to reposition, edit and remove hotspots.

Automatic object detection may be evaluated, but the manager must be able to review and correct its results before publication.

## 3.3 Direct appliance search

Guests must have a search function.

For example, a guest searches for AC.

The application must distinguish between:
- Living room AC.
- Bedroom one AC.
- Bedroom two AC.

Selecting a result should navigate to the correct room and highlight the correct object in the 3D environment.

Search must work alongside the 3D experience.

It must not replace it.

---

# PART 4: GUEST EXPERIENCE

The guest scans one apartment QR code.

The browser opens the apartment's published experience.

The guest does not need to install an application or register an account.

The guest interface must include:

- Interactive photorealistic 3D apartment.
- Connected room navigation.
- Interactive hotspots.
- Appliance search.
- Object highlighting.
- Appliance instructions.
- Short instructional videos.
- Common troubleshooting solutions.
- Contact support option.
- English and Arabic language support.
- Responsive mobile layout.

The guest must be able to use the application on ordinary iPhones and Android phones.

Do not assume guests have powerful devices or fast internet.

Use:
- Progressive loading.
- Optimized 3D assets.
- Appropriate compression.
- CDN delivery.
- Loading indicators.
- Lightweight fallback experiences.
- Efficient caching.

The product must still provide useful appliance information if the 3D viewer cannot load.

The fallback is a supporting reliability feature, not the primary product experience.

---

# PART 5: CHOOSE THE COMPLETE TECHNOLOGY STACK

You are responsible for researching and selecting the best technology stack.

Do not blindly follow a technology recommendation without evaluating it.

Use current official documentation and credible technical sources.

Record source links and verification dates.

## 5.1 Backend

Evaluate **Supabase as the primary backend**.

Determine whether it is suitable for:
- PostgreSQL database.
- Authentication.
- User management.
- Organizations and tenants.
- Row Level Security.
- Storage.
- Realtime events.
- Edge Functions.
- Database migrations.
- Audit information.

Identify which operations require separate cloud services.

Do not force video reconstruction, heavy processing or other resource-intensive workloads into Supabase if dedicated processing infrastructure is more appropriate.

## 5.2 Frontend

Select the best technologies for:

**Manager dashboard**
- Secure web dashboard.
- Property and apartment management.
- Scanning workflow.
- Video uploads.
- 3D preview.
- Hotspot management.

**Mobile capture application**
- Camera access.
- Guided recording.
- Room checkpoints.
- Upload management.
- Device permissions.
- Capture quality feedback.

**Guest application**
- Browser-based.
- Mobile-first.
- Photorealistic 3D viewer.
- Touch interaction.
- Search and navigation.
- QR entry.

Evaluate suitable languages and frameworks, including TypeScript where appropriate.

## 5.3 3D technology

Research and compare:
- Gaussian Splatting.
- Photogrammetry.
- NeRF-based approaches.
- Existing commercial reconstruction services.
- Mobile capture SDKs.
- Web-based 3D engines.
- 3D asset formats.
- Spatial anchors and hotspot systems.

Evaluate relevant technologies such as Three.js, Babylon.js and other suitable engines.

Do not select a tool only because it can display a 3D model.

It must support our actual workflow.

The selected solution should address:
- Video or image input.
- Reconstruction quality.
- Connected room representation.
- Export or API access.
- Cloud processing.
- Web viewing.
- Interactive positioning.
- Mobile performance.
- Commercial licensing.
- Cost per apartment.
- Long-term scalability.

## 5.4 Cloud infrastructure

Select the appropriate services for:
- Application hosting.
- Backend hosting.
- Database.
- Object storage.
- Video uploads.
- Video processing.
- 3D reconstruction.
- 3D asset storage.
- CDN.
- Background jobs.
- Queues.
- Notifications.
- Logging.
- Monitoring.
- Backups.

The application must be cloud-based.

Local development files may exist during development, but production data, media, processing and application services must use the selected cloud architecture.

## 5.5 Technology decision records

For each major decision, document:

1. Selected technology.
2. Reason for selection.
3. Alternatives.
4. Advantages.
5. Limitations.
6. Pricing.
7. Licensing.
8. Security considerations.
9. Integration method.
10. Future migration options.

Do not invent prices or capabilities.

Clearly distinguish verified pricing from estimates.

---

# PART 6: COMPLETE DATABASE DESIGN

Design the database before implementing dependent features.

The architecture must account for:

- Organizations.
- Users.
- Organization memberships.
- Roles.
- Permissions.
- Properties.
- Apartments.
- Rooms.
- Scan sessions.
- Uploaded videos.
- Processing jobs.
- Processing results.
- 3D assets.
- Appliance categories.
- Appliances.
- Appliance models.
- Hotspots.
- Instruction records.
- Instruction versions.
- Instructional media.
- QR codes.
- Guest sessions.
- Analytics events.
- Support interactions.
- Notifications.
- Audit logs.

For each table, document:
- Purpose.
- Columns.
- Data types.
- Primary keys.
- Foreign keys.
- Constraints.
- Indexes.
- Relationships.
- RLS policies.

Use migrations for schema changes.

Do not perform undocumented database modifications.

Implement strict tenant isolation.

One organization must never be able to access another organization's private apartments, scans, media or management information.

---

# PART 7: COMPLETE SECURITY FOUNDATION

Security is mandatory from the beginning.

Do not postpone it until the application is almost finished.

Design and implement:

## Authentication
- Secure registration.
- Login.
- Password reset.
- Email verification.
- Session handling.
- Logout.
- Account recovery.

## Authorization
- Role-based access.
- Organization-level permissions.
- Property-level permissions.
- Administrator permissions.
- Guest access restrictions.

## Database security
- Supabase RLS.
- Least-privilege access.
- Protected administrative operations.
- Tenant isolation.
- Secure migrations.
- Permission tests.

## API security
- Authentication.
- Authorization.
- Input validation.
- Rate limiting.
- Request size limits.
- Secure error handling.
- Abuse protection.

## Application security
- XSS prevention.
- SQL injection prevention.
- CSRF protection where applicable.
- SSRF protection.
- Secure session handling.
- Secure HTTP headers.
- Dependency vulnerability scanning.
- Secret management.
- Environment separation.

## File security
- File type validation.
- File size validation.
- Secure uploads.
- Private storage.
- Signed URLs.
- Upload authorization.
- Safe processing.
- Retention policies.

## Privacy
- Protect apartment interior recordings.
- Define ownership and access rules for uploaded scans.
- Limit unnecessary collection of guest information.
- Define retention and deletion policies.
- Maintain audit records.

Create a threat model and a security testing plan.

Never expose privileged API keys or service-role credentials in frontend code.

---

# PART 8: DESIGN SYSTEM AND APPLICATION INTERFACE

Create a complete design system before building major application screens.

The product must look like a professional hospitality technology platform.

Define:

- Brand identity.
- Primary and secondary colours.
- HEX colour values.
- Typography.
- Font sizes.
- Spacing.
- Grid system.
- Buttons.
- Inputs.
- Forms.
- Navigation.
- Cards.
- Tables.
- Modals.
- Notifications.
- Loading states.
- Empty states.
- Error states.
- Responsive layouts.
- Accessibility standards.
- 3D viewer controls.

The manager dashboard must be clean, professional and easy to use.

The guest interface must place the interactive apartment experience at the centre of the design.

Avoid generic templates, excessive dashboard cards and inconsistent styling.

Create reusable design tokens and components.

Document the complete design system in `docs/DESIGN_SYSTEM.md`.

---

# PART 9: COMPLETE APPLICATION MODULES

Your architecture and roadmap must account for all these modules.

1. Authentication and user accounts.
2. Organization management.
3. Property management.
4. Apartment management.
5. Guided 3D scanning.
6. Existing video uploads.
7. Upload validation.
8. Cloud reconstruction.
9. Processing management.
10. 3D asset storage.
11. Interactive 3D viewer.
12. Room navigation.
13. Appliance detection and hotspot placement.
14. Appliance management.
15. Appliance instruction library.
16. Instruction verification.
17. Guest QR access.
18. Guest application.
19. Appliance search.
20. Guest support.
21. Multilingual content.
22. Analytics.
23. Platform administration.
24. Notifications.
25. Security and audit logging.
26. Production operations.

Each module must have defined responsibilities, dependencies, database requirements, APIs, permissions and tests.

---

# PART 10: REPOSITORY AND PROJECT STRUCTURE

Create a clean, maintainable repository.

Separate the following responsibilities:

- Manager dashboard.
- Mobile capture application.
- Guest web application.
- Backend services.
- 3D reconstruction services.
- Shared components.
- Shared types.
- Database migrations.
- Infrastructure.
- Automated tests.
- Documentation.

Avoid unnecessary microservices.

Choose a maintainable architecture that supports future growth.

Before creating the structure, inspect the current workspace.

If no project exists, create a clean project directory.

Do not modify unrelated projects or files.

Document the purpose of every major directory.

---

# PART 11: MASTER PROJECT DOCUMENTATION

Create `PROJECT_MASTER.md` at the root of the repository.

This is the permanent source of truth for the project.

It must contain:

1. Complete product vision.
2. Product requirements.
3. User roles.
4. All application modules.
5. Complete feature inventory.
6. System architecture.
7. Technology stack.
8. Technology decisions.
9. Database architecture.
10. API architecture.
11. Security architecture.
12. Design system.
13. 3D capture and reconstruction architecture.
14. Cloud infrastructure.
15. Cost estimates.
16. Development roadmap.
17. Stage acceptance criteria.
18. Testing strategy.
19. Deployment strategy.
20. Production readiness requirements.
21. Known limitations.
22. Outstanding risks.
23. Future improvements.
24. Current project status.

Also create these supporting documents:

- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/TECH_STACK.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/API_SPECIFICATION.md`
- `docs/SECURITY.md`
- `docs/THREAT_MODEL.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/3D_TECHNOLOGY.md`
- `docs/INFRASTRUCTURE.md`
- `docs/TESTING_STRATEGY.md`
- `docs/DEVELOPMENT_ROADMAP.md`
- `docs/DECISION_LOG.md`
- `docs/CHANGELOG.md`
- `docs/KNOWN_ISSUES.md`
- `docs/DEPLOYMENT.md`
- `docs/OPERATIONS.md`

Do not write conflicting versions of the same information.

The master document must link to the supporting documents.

## Documentation maintenance rules

Every time a stage is completed:

- Update `PROJECT_MASTER.md`.
- Update the roadmap.
- Record implementation status.
- Record tests performed.
- Record test results.
- Record unresolved issues.
- Record architectural changes.
- Record important decisions.
- Record the next stage.

Never allow the documentation to become outdated.

A new Claude session must be able to read the documentation and understand exactly where development stopped and what needs to happen next.

---

# PART 12: COMPLETE DEVELOPMENT ROADMAP

Create a detailed roadmap covering the entire product.

Use the following phases.

### Phase 0: Discovery and technical research
- Understand the product.
- Research the technologies.
- Compare 3D reconstruction solutions.
- Evaluate cloud providers.
- Evaluate Supabase.
- Identify technical risks.
- Establish product requirements.
- Produce technical recommendations.

### Phase 1: Architecture and foundation
- Repository structure.
- Application architecture.
- Coding standards.
- Environment configuration.
- Git setup.
- CI/CD foundation.
- Secrets management.
- Documentation.
- Development environment.

### Phase 2: Backend and database
- Supabase setup.
- Database schema.
- Migrations.
- Authentication.
- Roles.
- Permissions.
- RLS.
- Storage.
- APIs.
- Backend tests.

### Phase 3: Design system and frontend foundation
- Design tokens.
- Reusable components.
- Manager dashboard shell.
- Guest application shell.
- Responsive layouts.
- Navigation.

### Phase 4: Property management
- Organizations.
- Properties.
- Apartments.
- Room structure.
- Manager permissions.
- QR foundation.

### Phase 5: Capture and uploads
- Direct capture.
- Guided room checkpoints.
- Existing video uploads.
- Validation.
- Secure storage.
- Upload progress.
- Capture quality feedback.

### Phase 6: 3D reconstruction
- Reconstruction provider integration.
- Processing pipeline.
- Background jobs.
- Cloud processing.
- Asset generation.
- Spatial continuity.
- Preview generation.
- Quality validation.

### Phase 7: Interactive 3D viewer
- 3D rendering.
- Camera controls.
- Room navigation.
- Room transitions.
- Touch interaction.
- Mobile performance.
- Asset optimization.

### Phase 8: Appliance hotspots
- Hotspot placement.
- Appliance records.
- Model information.
- Instruction library.
- Media.
- Verification.
- Publishing.

### Phase 9: Guest application
- QR access.
- 3D exploration.
- Search.
- Appliance highlighting.
- Instructions.
- Videos.
- Troubleshooting.
- Languages.
- Support contact.

### Phase 10: Analytics and administration
- Guest analytics.
- Search analytics.
- Usage reporting.
- Processing monitoring.
- Administration.
- Audit logs.

### Phase 11: Security and quality assurance
- Security audit.
- Vulnerability assessment.
- Penetration testing.
- Performance testing.
- Load testing.
- Accessibility.
- Mobile compatibility.
- Recovery testing.

### Phase 12: Real apartment pilot
- Scan one apartment.
- Validate visual quality.
- Validate room connections.
- Place real appliance hotspots.
- Test guest access.
- Test iOS and Android browsers.
- Measure loading performance.
- Collect feedback.
- Fix issues.

### Phase 13: Production deployment
- Production configuration.
- Database backup verification.
- Infrastructure deployment.
- Monitoring.
- Logging.
- Error reporting.
- Deployment documentation.
- Production readiness audit.

### Phase 14: Scaling and improvements
- Expand to the remaining apartments.
- Improve scanning.
- Improve reconstruction.
- Expand language support.
- Add integrations.
- Introduce subscription capabilities when appropriate.
- Scale infrastructure based on actual usage.

Every phase must contain specific tasks and acceptance criteria.

---

# PART 13: REQUIRED DEVELOPMENT WORKFLOW

Follow this workflow throughout the project:

**PROJECT → PHASE → STAGE → IMPLEMENT → TEST → AUDIT → APPROVE → DOCUMENT → NEXT STAGE**

For every stage:

1. Read the master project documentation.
2. Confirm the current stage.
3. Identify dependencies.
4. Identify affected components.
5. Review security implications.
6. Implement the defined tasks.
7. Run relevant automated tests.
8. Run integration tests.
9. Verify the actual application behaviour.
10. Audit the implementation.
11. Fix discovered problems.
12. Update documentation.
13. Record the completion evidence.
14. Move to the next stage only when acceptance criteria pass.

Do not skip testing because a feature appears to work.

Do not mark a stage complete if important tests are failing.

Do not leave known security vulnerabilities unresolved without documenting their severity and mitigation.

## Work independently

You are expected to carry the work forward.

Do not stop after producing a plan.

Do not repeatedly ask the user to approve ordinary technical decisions.

Make well-researched decisions and document them.

Ask the user only when a decision requires their personal choice, account access, credentials, payment, legal authorization, or another action that cannot safely be assumed.

Never create paid accounts, purchase subscriptions, publish publicly or perform destructive actions without the required authorization.

Do not invent credentials or pretend external services have been connected.

When a service requires credentials, prepare the integration and clearly identify the exact user action needed.

## Execute first, report at the end

Use focused implementation stages.

Avoid unnecessary explanations before doing the work.

Do not repeatedly return a list of tasks without implementing anything.

At the end of each stage, report:
- What was implemented.
- What was tested.
- What passed.
- What failed.
- What was fixed.
- What remains.
- Which documents were updated.
- The next stage.

---

# PART 14: TESTING REQUIREMENTS

Testing must be part of development from the beginning.

Include:

### Unit tests
Test individual components and functions.

### Integration tests
Test interactions between the frontend, backend, database, storage and processing services.

### End-to-end tests
Test complete manager and guest workflows.

### Database security tests
Verify RLS, tenant isolation and permission boundaries.

### API security tests
Verify authorization, input validation, rate limiting and error handling.

### Upload tests
Test file validation, upload interruptions, retries and access restrictions.

### 3D tests
Verify:
- Reconstruction quality.
- Room continuity.
- Hotspot coordinates.
- Object selection.
- Room navigation.
- Asset loading.
- Mobile performance.

### Device compatibility
Test:
- iPhone.
- Android phones.
- iPad and tablets.
- Desktop browsers.
- Different screen sizes.
- Slower mobile connections.

### Performance
Measure:
- Initial load time.
- 3D asset download size.
- Rendering performance.
- Memory usage.
- Processing time.
- Upload reliability.

### Security
Include dependency scanning, vulnerability assessment and authorized penetration testing.

Use staging environments for security and load testing.

Document actual results. Never fabricate test evidence.

---

# PART 15: PRODUCTION COMPLETION CRITERIA

The project is not finished merely because the dashboard opens or the 3D viewer displays a model.

The product is complete when the following workflow works end to end:

1. A manager creates an account.
2. The manager creates an organization.
3. The manager creates a property.
4. The manager adds an apartment.
5. The manager captures the apartment directly or uploads an existing video.
6. The system securely uploads and processes the footage.
7. The system generates a photorealistic, connected 3D apartment.
8. The manager reviews the result.
9. The manager adds appliance hotspots.
10. The manager adds verified instructions and videos.
11. The manager previews the guest experience.
12. The manager publishes the apartment.
13. The system generates a QR code.
14. A guest scans the QR code.
15. The guest opens the apartment in a browser.
16. The guest explores the 3D apartment.
17. The guest selects an appliance.
18. The guest receives instructions for that exact appliance.
19. The guest can search for an appliance and navigate to its location.
20. The guest can contact support if necessary.
21. The manager can see meaningful usage analytics.

The complete workflow must be tested with real apartment footage.

The product must also meet documented security, performance, reliability and operational requirements.

Do not declare production readiness until the required evidence exists.

---

# PART 16: IMPORTANT PRODUCT RULES

These rules must never be lost during development.

1. The 3D apartment is the main product experience.
2. The 3D environment must represent the actual apartment, not a generic illustrated floor plan.
3. The apartment must be connected across rooms.
4. Guests must be able to interact with actual appliance locations.
5. Search is a supporting shortcut, not a replacement for 3D.
6. Both direct scanning and existing video upload must be supported.
7. Guided room checkpoints must be part of the capture workflow.
8. The manager must review generated content before publishing.
9. Appliance information must be specific to the correct model whenever possible.
10. The guest experience must work in a mobile browser.
11. The manager dashboard must be secure.
12. The backend and production infrastructure must be cloud-based.
13. Security must be built into every development stage.
14. Documentation must remain current.
15. Every stage must be tested before moving forward.

---

# PART 17: YOUR FIRST EXECUTION TASK

Start now.

Do not begin by building random application screens.

Your first responsibility is to establish the project properly.

Complete the following in order:

**STEP 1: Inspect the workspace**
- Check the current working directory.
- Identify whether a project already exists.
- Do not modify unrelated projects.
- Establish the correct project root.

**STEP 2: Establish the product specification**
- Convert this prompt into a complete, structured product requirements document.
- Identify all user journeys.
- Identify all system modules.
- Identify functional and non-functional requirements.

**STEP 3: Research the technology**
- Research current 3D reconstruction options.
- Evaluate Gaussian Splatting solutions.
- Compare capture SDKs and cloud processing providers.
- Evaluate web 3D engines.
- Evaluate Supabase.
- Evaluate frontend and mobile technologies.
- Compare costs, licensing and integration requirements.
- Verify important claims against current documentation.

**STEP 4: Design the architecture**
- Create the complete system architecture.
- Define all application components.
- Define database relationships.
- Define APIs.
- Define processing workflows.
- Define security boundaries.
- Define cloud infrastructure.

**STEP 5: Create all master documentation**
- Create PROJECT_MASTER.md.
- Create the supporting documents.
- Create the complete staged roadmap.
- Create decision records.
- Create acceptance criteria for every stage.

**STEP 6: Establish the technical foundation**
After documenting and validating the architecture, begin implementing the approved foundation.

This includes the repository structure, development configuration, environment separation, coding standards, initial application setup, database foundation and testing infrastructure.

Do not implement advanced features before their dependencies are ready.

**STEP 7: Continue development stage by stage**
Once the foundation passes its tests, continue through the roadmap.

Do not stop at the architecture report.

The objective is to build the complete working product.

---

# FINAL INSTRUCTION

Treat this prompt as the permanent product specification and development mandate.

You own the technical execution.

You must preserve the entire product vision while making sound engineering decisions.

Do not reduce the product to a basic guidebook.

Do not abandon 3D because it is technically challenging. Research the right approach, identify limitations, propose alternatives and solve the technical problems systematically.

Do not build features without considering how they connect to the complete application.

Do not leave security, testing, documentation or deployment until the end.

**Build the foundation correctly. Document the entire journey. Implement each stage. Test everything. Fix failures. Verify the results. Continue until the complete application meets its production acceptance criteria.**

At the end of your first execution session, provide a concise report showing:
1. Project structure established.
2. Research completed.
3. Recommended technology stack.
4. Architecture documented.
5. Security foundation planned.
6. Master documentation created.
7. Foundation implemented.
8. Tests performed and results.
9. Outstanding blockers requiring the user's action.
10. Next development stage.

The project must remain understandable and maintainable even if a different developer or a new Claude session takes over.
